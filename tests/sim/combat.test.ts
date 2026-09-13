import { describe, expect, it } from "vite-plus/test";
import { runWave } from "../../src/sim/combat/runWave.ts";
import { WaveSim } from "../../src/sim/combat/WaveSim.ts";
import { enemyDef } from "../../src/sim/combat/enemies.ts";
import { waveDef } from "../../src/sim/combat/waves.ts";
import type { SimEvent } from "../../src/sim/events.ts";
import { LANE_LENGTH } from "../../src/sim/modifiers.ts";
import { Rng } from "../../src/sim/rng.ts";
import { build, wave } from "./helpers.ts";

const evs = <T extends SimEvent["t"]>(events: { ev: SimEvent }[], t: T) =>
  events.map((e) => e.ev).filter((e): e is Extract<SimEvent, { t: T }> => e.t === t);

describe("WaveSim: movement and breach", () => {
  it("an unopposed grunt walks the lane and damages the base", () => {
    const grunt = enemyDef("grunt");
    const run = runWave({
      backpack: build([]),
      wave: wave([{ tick: 0, lane: 2, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(run.result).toBe("cleared");
    // spawn at tick 0 at LANE_LENGTH, moves `speed` per tick, breach when pos hits 0
    expect(run.ticks).toBe(Math.ceil(LANE_LENGTH / grunt.speed));
    const breaches = evs(run.events, "breach");
    expect(breaches).toEqual([{ t: "breach", id: 1, lane: 2, baseDamage: grunt.breachDamage }]);
    expect(run.baseHp).toBe(20 - grunt.breachDamage);
    expect(evs(run.events, "enemyKilled")).toHaveLength(0);
    expect(evs(run.events, "waveEnded")[0]!.result).toBe("cleared");
  });

  it("the base falls when HP reaches zero and the wave ends immediately", () => {
    const run = runWave({
      backpack: build([]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 30, spacingTicks: 1 }]),
      rng: new Rng(1),
      baseHp: 3,
    });
    expect(run.result).toBe("baseDestroyed");
    expect(run.baseHp).toBe(0);
    expect(evs(run.events, "breach")).toHaveLength(3);
    expect(evs(run.events, "goldEarned").filter((g) => g.source.kind === "wave")).toHaveLength(0);
  });

  it("a spiked shield at the top of the column absorbs one breach and retaliates", () => {
    const run = runWave({
      backpack: build([["spiked_shield", { col: 1, row: 2 }, 0, 1, "shield"]]),
      wave: wave([{ tick: 0, lane: 1, enemy: "runner", count: 2, spacingTicks: 10 }]),
      rng: new Rng(1),
    });
    const breaches = evs(run.events, "breach");
    expect(breaches[0]).toEqual({
      t: "breach",
      id: 1,
      lane: 1,
      absorbedBy: "shield",
      baseDamage: 0,
    });
    expect(breaches[1]).toEqual({ t: "breach", id: 2, lane: 1, baseDamage: 1 });
    expect(evs(run.events, "itemChargeUsed")).toEqual([
      { t: "itemChargeUsed", itemId: "shield", remaining: 0 },
    ]);
    // runner has 5 hp, shield retaliates 6: killed, gold credited to the shield
    const kills = evs(run.events, "enemyKilled");
    expect(kills).toHaveLength(1);
    expect(kills[0]!.source).toEqual({ kind: "item", itemId: "shield", via: "retaliation" });
    expect(run.baseHp).toBe(19);
  });

  it("a non-defensive top item does not absorb", () => {
    const run = runWave({
      backpack: build([["coin_purse", { col: 0, row: 0 }]]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(run.events, "breach")[0]!.absorbedBy).toBeUndefined();
    expect(run.baseHp).toBe(19);
  });
});

describe("WaveSim: weapons", () => {
  it("a crossbow kills a grunt in two shots and is credited", () => {
    const run = runWave({
      backpack: build([["crossbow", { col: 0, row: 0 }, 0, 1, "xb"]]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }], 99, 5),
      rng: new Rng(1),
    });
    expect(run.result).toBe("cleared");
    expect(run.baseHp).toBe(20);
    expect(evs(run.events, "weaponFired")).toHaveLength(2); // 4 dmg x 2 >= 8 hp
    const dmg = evs(run.events, "enemyDamaged");
    expect(dmg.map((d) => d.hp)).toEqual([4, 0]);
    expect(dmg.at(-1)!.overkill).toBe(0);
    expect(evs(run.events, "enemyKilled")[0]!.source).toEqual({
      kind: "item",
      itemId: "xb",
      via: "shot",
    });
    const gold = evs(run.events, "goldEarned");
    expect(gold.map((g) => [g.amount, g.source.kind])).toEqual([
      [1, "item"],
      [5, "wave"],
    ]);
  });

  it("weapons only target their own column", () => {
    const run = runWave({
      backpack: build([["crossbow", { col: 0, row: 0 }]]),
      wave: wave([{ tick: 0, lane: 3, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(run.events, "weaponFired")).toHaveLength(0);
    expect(run.baseHp).toBe(19);
  });

  it("targets the frontmost enemy, ties broken by lower id", () => {
    const sim = new WaveSim({
      backpack: build([["crossbow", { col: 0, row: 0 }]]),
      wave: wave([
        { tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }, // id 1, spawns first
        { tick: 0, lane: 0, enemy: "runner", count: 1, spacingTicks: 1 }, // id 2, faster
      ]),
      rng: new Rng(1),
    });
    const t0 = sim.step(); // both spawn at pos 1000; tie -> id 1
    expect(evs([{ ev: t0.find((e) => e.t === "weaponFired")! }], "weaponFired")[0]!.targetId).toBe(
      1,
    );
    // after moving, the runner (id 2) is in front
    let fired;
    while (!fired) {
      const es = sim.step();
      fired = es.find((e) => e.t === "weaponFired");
    }
    expect((fired as { targetId: number }).targetId).toBe(2);
  });

  it("a horizontal cannon covers two lanes and splashes nearby enemies", () => {
    const run = runWave({
      backpack: build([["cannon", { col: 1, row: 0 }, 1, 1, "cn"]]),
      wave: wave([
        { tick: 0, lane: 1, enemy: "grunt", count: 3, spacingTicks: 0 }, // same position, within splash 60
        { tick: 0, lane: 2, enemy: "grunt", count: 1, spacingTicks: 1 },
      ]),
      rng: new Rng(1),
    });
    const first = evs(run.events, "enemyDamaged").slice(0, 3);
    expect(first.map((d) => d.source)).toEqual([
      { kind: "item", itemId: "cn", via: "shot" },
      { kind: "item", itemId: "cn", via: "splash" },
      { kind: "item", itemId: "cn", via: "splash" },
    ]);
    // The same cannon also covers lane 2.
    const lane2 = runWave({
      backpack: build([["cannon", { col: 1, row: 0 }, 1, 1, "cn"]]),
      wave: wave([{ tick: 0, lane: 2, enemy: "grunt", count: 1, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    expect(evs(lane2.events, "weaponFired")[0]!.lane).toBe(2);
  });

  it("a vertical cannon covers one lane", () => {
    const run = runWave({
      backpack: build([["cannon", { col: 1, row: 0 }, 0]]),
      wave: wave([{ tick: 0, lane: 2, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(run.events, "weaponFired")).toHaveLength(0);
  });

  it("front row fires first: a weapon on row 3 waits rowDelayTicks*3", () => {
    const mk = (row: number) =>
      new WaveSim({
        backpack: build([["crossbow", { col: 0, row }]]),
        wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }]),
        rng: new Rng(1),
      });
    const firstFire = (sim: WaveSim) => {
      for (let i = 0; i < 100; i++) if (sim.step().some((e) => e.t === "weaponFired")) return i;
      return -1;
    };
    expect(firstFire(mk(0))).toBe(0);
    expect(firstFire(mk(3))).toBe(9);
  });

  it("flat armor reduces non-magic damage to at least 1; magic ignores it", () => {
    const xb = runWave({
      backpack: build([["crossbow", { col: 0, row: 0 }]]),
      wave: wave([{ tick: 0, lane: 0, enemy: "armored", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(xb.events, "enemyDamaged")[0]!.amount).toBe(1); // 4 - 3 armor
    const fl = runWave({
      backpack: build([["flame_lance", { col: 0, row: 0 }]]),
      wave: wave([{ tick: 0, lane: 0, enemy: "armored", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(fl.events, "enemyDamaged")[0]!.amount).toBe(1); // 1 dmg, armor ignored
  });

  it("ballista pierces up to three enemies in the column", () => {
    const run = runWave({
      backpack: build([["ballista", { col: 0, row: 0 }, 0, 1, "bl"]]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 4, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    const firstShot = evs(run.events, "enemyDamaged").slice(0, 3);
    expect(firstShot.map((d) => d.source)).toEqual([
      { kind: "item", itemId: "bl", via: "shot" },
      { kind: "item", itemId: "bl", via: "pierce" },
      { kind: "item", itemId: "bl", via: "pierce" },
    ]);
  });
});

describe("WaveSim: supports and statuses", () => {
  it("gearbox speeds up an adjacent crossbow and emits buffApplied", () => {
    const sim = new WaveSim({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }, 0, 1, "xb"],
        ["gearbox", { col: 0, row: 1 }, 0, 1, "gb"],
      ]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    const first = sim.step();
    expect(first.filter((e) => e.t === "buffApplied")).toEqual([
      { t: "buffApplied", itemId: "xb", byItemId: "gb", buff: "attackSpeedPct", amount: 25 },
    ]);
    expect(sim.snapshot().weapons[0]!.cooldownTicks).toBe(9); // floor(12*100/125)
  });

  it("ammunition pouch adds flat damage to projectile weapons only", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }],
        ["flame_lance", { col: 2, row: 0 }],
        ["ammo_pouch", { col: 1, row: 0 }],
      ]),
      wave: wave([
        { tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 },
        { tick: 0, lane: 2, enemy: "grunt", count: 1, spacingTicks: 1 },
      ]),
      rng: new Rng(1),
    });
    const buffs = evs(run.events, "buffApplied");
    expect(buffs).toHaveLength(1);
    expect(buffs[0]!.itemId).toBe("crossbow#1");
    const xbHit = evs(run.events, "enemyDamaged").find(
      (d) => d.source.kind === "item" && d.source.itemId === "crossbow#1",
    );
    expect(xbHit!.amount).toBe(6); // 4 + 2
  });

  it("frost flask slows enemies hit by the adjacent weapon; slow is credited to the flask", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }, 0, 1, "xb"],
        ["frost_flask", { col: 1, row: 0 }, 0, 1, "ff"],
      ]),
      wave: wave([{ tick: 0, lane: 0, enemy: "armored", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    const applied = evs(run.events, "statusApplied");
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[0]).toMatchObject({
      status: "slow",
      magnitude: 30,
      ticks: 30,
      source: { itemId: "ff", via: "status" },
    });
    // slowed armored moves floor(7*0.7)=4 per tick instead of 7
    const moves = evs(run.events, "enemyMoved");
    const afterSlow = moves.find((m, i) => i > 0 && moves[i - 1]!.pos - m.pos === 4);
    expect(afterSlow).toBeDefined();
    expect(evs(run.events, "statusExpired").length).toBeGreaterThanOrEqual(0);
  });

  it("fire rune burns; burn damage is credited to the rune", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }, 0, 1, "xb"],
        ["fire_rune", { col: 0, row: 1 }, 0, 1, "fr"],
      ]),
      wave: wave([{ tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    const burn = evs(run.events, "enemyDamaged").filter(
      (d) => d.source.kind === "item" && d.source.via === "burn",
    );
    expect(burn.length).toBeGreaterThan(0);
    expect(burn[0]!.source).toEqual({ kind: "item", itemId: "fr", via: "burn" });
  });

  it("lodestone lets a crossbow reach the neighbouring lane", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }],
        ["lodestone", { col: 0, row: 1 }],
      ]),
      wave: wave([{ tick: 0, lane: 1, enemy: "grunt", count: 1, spacingTicks: 1 }]),
      rng: new Rng(1),
    });
    expect(evs(run.events, "weaponFired").length).toBeGreaterThan(0);
  });
});

describe("WaveSim: real waves", () => {
  it("wave 1 is cleared by four front-row crossbows without base damage", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }],
        ["crossbow", { col: 1, row: 0 }],
        ["crossbow", { col: 2, row: 0 }],
        ["crossbow", { col: 3, row: 0 }],
      ]),
      wave: waveDef(1),
      rng: new Rng(1),
    });
    expect(run.result).toBe("cleared");
    expect(run.baseHp).toBe(20);
    expect(evs(run.events, "enemyKilled")).toHaveLength(8);
  });

  it("wave 1 against an empty bag costs 8 base HP", () => {
    const run = runWave({ backpack: build([]), wave: waveDef(1), rng: new Rng(1) });
    expect(run.result).toBe("cleared");
    expect(run.baseHp).toBe(12);
  });

  it("step() returns nothing after the wave has ended", () => {
    const sim = new WaveSim({ backpack: build([]), wave: waveDef(1), rng: new Rng(1) });
    while (!sim.ended) sim.step();
    expect(sim.step()).toEqual([]);
    expect(sim.snapshot().enemies).toEqual([]);
  });
});
