import { describe, expect, it } from "vite-plus/test";
import { Run } from "../../src/sim/Run.ts";
import { VOLLEY_COOLDOWN, WaveSim } from "../../src/sim/combat/WaveSim.ts";
import type { SimEvent } from "../../src/sim/events.ts";
import { itemDef } from "../../src/sim/items/defs.ts";
import { Rng } from "../../src/sim/rng.ts";
import { reduceWave } from "../../src/sim/stats/RunStats.ts";
import { build, wave } from "./helpers.ts";

describe("Volley", () => {
  it("fires every weapon covering the lane at +50% and starts the cooldown", () => {
    const sim = new WaveSim({
      backpack: build([
        ["crossbow", { col: 0, row: 0 }, 0, 1, "xb"],
        ["cannon", { col: 0, row: 1 }, 1, 1, "cn"], // covers 0 and 1
        ["crossbow", { col: 3, row: 0 }, 0, 1, "far"],
      ]),
      wave: wave([{ tick: 0, lane: 0, enemy: "armored", count: 1, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    sim.step(); // spawn; weapons fire normally on tick 0 (row 0) -> ignore
    const before = sim.snapshot();
    const hpBefore = before.enemies[0]!.hp;
    const es = sim.useVolley(0);
    expect(es[0]).toEqual({ t: "abilityUsed", lane: 0 });
    const fired = es.filter((e) => e.t === "weaponFired") as Extract<
      SimEvent,
      { t: "weaponFired" }
    >[];
    expect(fired.map((f) => f.itemId).sort()).toEqual(["cn", "xb"]);
    const dmg = es.filter((e) => e.t === "enemyDamaged") as Extract<
      SimEvent,
      { t: "enemyDamaged" }
    >[];
    // crossbow 3*1.5=4 -3 armor = 1 ; cannon 8*1.5=12 -3 = 9
    expect(dmg.map((d) => d.amount).sort((a, b) => a - b)).toEqual([1, 9]);
    expect(sim.snapshot().enemies[0]!.hp).toBe(hpBefore - 10);
    expect(sim.volleyCooldown).toBe(VOLLEY_COOLDOWN);
    expect(sim.useVolley(0)).toEqual([]); // on cooldown
    sim.step();
    expect(sim.volleyCooldown).toBe(VOLLEY_COOLDOWN - 1);
  });

  it("does nothing on an empty lane except spend the cooldown", () => {
    const sim = new WaveSim({
      backpack: build([["crossbow", { col: 0, row: 0 }]]),
      wave: wave([{ tick: 0, lane: 3, enemy: "grunt", count: 1, spacingTicks: 0 }]),
      rng: new Rng(1),
    });
    sim.step();
    const es = sim.useVolley(0);
    expect(es).toEqual([{ t: "abilityUsed", lane: 0 }]);
    expect(sim.useVolley(9)).toEqual([]);
  });

  it("is available through Run during a wave and counted in stats", () => {
    const run = new Run({ seed: 4 });
    run.backpack.place(
      { id: "xb", defId: "crossbow", tier: 1, shape: itemDef("crossbow").shape },
      { col: 1, row: 0 },
    );
    expect(run.useAbility(1)).toBe(false); // not in a wave
    run.startWave();
    run.stepWave();
    expect(run.useAbility(1)).toBe(true);
    expect(run.abilityCooldown).toBe(VOLLEY_COOLDOWN);
    while (run.phase === "wave") run.stepWave();
    expect(reduceWave(run.lastWaveEvents).abilitiesUsed).toBe(1);
  });
});
