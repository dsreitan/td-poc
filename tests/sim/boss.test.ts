import { describe, expect, it } from "vite-plus/test";
import { runWave } from "../../src/sim/combat/runWave.ts";
import { WaveSim } from "../../src/sim/combat/WaveSim.ts";
import { enemyDef, possibleLanes, switchedLane } from "../../src/sim/combat/enemies.ts";
import { previewWave, WAVES, waveDef } from "../../src/sim/combat/waves.ts";
import type { SimEvent } from "../../src/sim/events.ts";
import { Rng } from "../../src/sim/rng.ts";
import { build, wave } from "./helpers.ts";

const evs = <T extends SimEvent["t"]>(events: { ev: SimEvent }[], t: T) =>
  events.map((e) => e.ev).filter((e): e is Extract<SimEvent, { t: T }> => e.t === t);

describe("boss phases", () => {
  it("warden shields at half HP and then loses its armor", () => {
    const run = runWave({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }, 0, 3, "xb1"],
        ["crossbow", { col: 0, row: 1 }, 0, 3, "xb2"],
      ]),
      wave: wave([{ tick: 0, lane: 0, enemy: "warden", count: 1, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    const phases = evs(run.events, "bossPhaseEntered");
    expect(phases).toEqual([{ t: "bossPhaseEntered", bossId: 1, phase: 0 }]);
    const phaseTick = run.events.find((e) => e.ev.t === "bossPhaseEntered")!.tick;
    const dmg = run.events.filter((e) => e.ev.t === "enemyDamaged") as {
      tick: number;
      ev: Extract<SimEvent, { t: "enemyDamaged" }>;
    }[];
    // Crossbow tier 3 deals 12. Before the phase armor 2 applies: 10.
    const before = dmg.filter((d) => d.tick < phaseTick);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((d) => d.ev.amount === 10)).toBe(true);
    // During the 60-tick shield every hit lands for 0.
    const during = dmg.filter((d) => d.tick > phaseTick && d.tick <= phaseTick + 60);
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((d) => d.ev.amount === 0)).toBe(true);
    // Afterwards armor is 0: full 12.
    const after = dmg.filter((d) => d.tick > phaseTick + 60);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.ev.amount).toBe(12);
    expect(evs(run.events, "enemyKilled")).toHaveLength(1);
    expect(run.baseHp).toBe(20);
  });

  it("bulwark switches lane below position 500 and strips charges instead of bouncing", () => {
    const sim = new WaveSim({
      backpack: build([
        ["iron_wall", { col: 2, row: 0 }, 0, 1, "wall"],
        ["spiked_shield", { col: 2, row: 2 }, 0, 1, "sh"],
      ]),
      wave: wave([{ tick: 0, lane: 1, enemy: "bulwark", count: 1, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    const all: SimEvent[] = [];
    let laneAtSwitch = -1;
    while (!sim.ended) {
      const es = sim.step();
      all.push(...es);
      if (es.some((e) => e.t === "bossPhaseEntered"))
        laneAtSwitch = sim.snapshot().enemies[0]!.lane;
    }
    expect(laneAtSwitch).toBe(2);
    const breach = all.find((e) => e.t === "breach") as Extract<SimEvent, { t: "breach" }>;
    expect(breach.lane).toBe(2);
    expect(breach.absorbedBy).toBeUndefined();
    expect(breach.baseDamage).toBe(8);
    // every defensive item covering lane 2 lost all charges
    const strips = all.filter((e) => e.t === "itemChargeUsed") as Extract<
      SimEvent,
      { t: "itemChargeUsed" }
    >[];
    expect(
      strips.map((s) => [s.itemId, s.remaining]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual([
      ["sh", 0],
      ["wall", 0],
    ]);
    expect(sim.currentBaseHp).toBe(12);
  });

  it("lane switching reflects at the edge", () => {
    expect(switchedLane(1, 1, 4)).toBe(2);
    expect(switchedLane(3, 1, 4)).toBe(2);
    expect(switchedLane(0, -1, 4)).toBe(1);
    expect(possibleLanes(enemyDef("bulwark"), 3, 4)).toEqual([2, 3]);
    expect(possibleLanes(enemyDef("grunt"), 3, 4)).toEqual([3]);
  });

  it("preview marks the lanes a boss may visit", () => {
    const p = previewWave(waveDef(10));
    expect(p.lanes[1]!.counts["bulwark"]).toBe(1);
    expect(p.lanes[2]!.bossVisits).toEqual(["bulwark"]);
    expect(p.lanes[1]!.bossVisits).toEqual([]);
  });
});

describe("waves 1-10", () => {
  it("are ten, ordered, and each lasts roughly 20-45 s including travel", () => {
    expect(WAVES).toHaveLength(10);
    for (const w of WAVES) {
      const p = previewWave(w);
      // last spawn + slowest travel (grunt 100 ticks) as a rough upper bound
      const approxTicks = p.lastSpawnTick + 200;
      expect(approxTicks, `wave ${w.id}`).toBeLessThan(45 * 20);
      expect(p.total, `wave ${w.id}`).toBeGreaterThan(5);
    }
  });

  it("boss waves are 5 and 10", () => {
    const bossWaves = WAVES.filter((w) => w.spawns.some((g) => enemyDef(g.enemy).isBoss)).map(
      (w) => w.id,
    );
    expect(bossWaves).toEqual([5, 10]);
  });

  it("a strong reference build survives all ten waves", () => {
    const bp = () =>
      build([
        ["ballista", { col: 0, row: 0 }, 0, 3],
        ["cannon", { col: 1, row: 0 }, 1, 3],
        ["ballista", { col: 3, row: 0 }, 0, 3],
        ["crossbow", { col: 1, row: 1 }, 0, 3],
        ["crossbow", { col: 2, row: 1 }, 0, 3],
        ["gearbox", { col: 1, row: 2 }, 0, 3],
        ["gearbox", { col: 2, row: 2 }, 0, 3],
        ["ammo_pouch", { col: 0, row: 2 }, 0, 3],
        ["frost_flask", { col: 3, row: 2 }, 0, 3],
      ]);
    let hp = 20;
    for (const w of WAVES) {
      const r = runWave({ backpack: bp(), wave: w, rng: new Rng(1), baseHp: hp });
      hp = r.baseHp;
      expect(r.result, `wave ${w.id}`).toBe("cleared");
    }
    expect(hp).toBeGreaterThan(0);
  });
});
