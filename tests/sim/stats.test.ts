import { describe, expect, it } from "vite-plus/test";
import { runWave } from "../../src/sim/combat/runWave.ts";
import { previewWave, waveDef } from "../../src/sim/combat/waves.ts";
import { Rng } from "../../src/sim/rng.ts";
import { aggregate } from "../../src/sim/stats/aggregate.ts";
import { reduceWave, StatsAccumulator, topDamage } from "../../src/sim/stats/RunStats.ts";
import { build, wave } from "./helpers.ts";

describe("stats reducer", () => {
  const bp = () =>
    build([
      ["crossbow", { col: 0, row: 0 }, 0, 1, "xb"],
      ["cannon", { col: 1, row: 0 }, 1, 1, "cn"],
      ["gearbox", { col: 0, row: 1 }, 0, 1, "gb"],
      ["frost_flask", { col: 1, row: 1 }, 0, 1, "ff"],
      ["spiked_shield", { col: 3, row: 0 }, 0, 1, "sh"],
    ]);

  it("attributes damage, kills, shots and gold per item, and wave gold to the wave", () => {
    const run = runWave({ backpack: bp(), wave: waveDef(2), rng: new Rng(1) });
    const st = reduceWave(run.events);
    expect(st.wave).toBe(2);
    expect(st.result).toBe("cleared");
    expect(st.ticks).toBe(run.ticks);
    expect(st.enemiesSpawned).toBe(previewWave(waveDef(2)).total);
    const xb = st.sources["item:xb"]!;
    const cn = st.sources["item:cn"]!;
    expect(xb.shots).toBeGreaterThan(0);
    expect(xb.totalDamage).toBe(xb.damage.shot);
    expect(cn.damage.splash).toBeGreaterThanOrEqual(0);
    expect(cn.totalDamage).toBe(cn.damage.shot + cn.damage.splash);
    const totalKills = Object.values(st.sources).reduce((a, s) => a + s.kills, 0);
    expect(totalKills).toBe(st.enemiesKilled);
    expect(st.sources["wave"]!.gold).toBe(waveDef(2).clearBonus);
    const goldSum = Object.values(st.sources).reduce((a, s) => a + s.gold, 0);
    expect(goldSum).toBe(st.totalGold);
  });

  it("credits supports with buffs granted and statuses applied", () => {
    const run = runWave({ backpack: bp(), wave: waveDef(1), rng: new Rng(1) });
    const st = reduceWave(run.events);
    expect(st.sources["item:gb"]!.buffsGranted).toEqual([
      { to: "xb", buff: "attackSpeedPct", amount: 25 },
    ]);
    expect(st.sources["item:xb"]!.buffsReceived).toEqual([
      { from: "gb", buff: "attackSpeedPct", amount: 25 },
    ]);
    expect(st.sources["item:ff"]!.buffsGranted).toEqual([
      { to: "cn", buff: "slowOnHit", amount: 30 },
    ]);
    // Statuses land only on survivors, so use enemies the cannon cannot one-shot.

    const tough = runWave({
      backpack: bp(),

      wave: wave([{ tick: 0, lane: 1, enemy: "armored", count: 3, spacingTicks: 30 }]),

      rng: new Rng(1),
    });

    const ff = reduceWave(tough.events).sources["item:ff"]!;

    expect(ff.statusesApplied.slow.count).toBeGreaterThan(0);

    expect(ff.statusesApplied.slow.ticks).toBe(ff.statusesApplied.slow.count * 30);
    expect(st.sources["item:ff"]!.totalDamage).toBe(0);
  });

  it("counts blocks and lane pressure", () => {
    const run = runWave({
      backpack: build([["spiked_shield", { col: 3, row: 0 }, 0, 1, "sh"]]),
      wave: wave([
        { tick: 0, lane: 3, enemy: "grunt", count: 2, spacingTicks: 5 },
        { tick: 0, lane: 0, enemy: "grunt", count: 1, spacingTicks: 5 },
      ]),
      rng: new Rng(1),
    });
    const st = reduceWave(run.events);
    expect(st.sources["item:sh"]!.blocks).toBe(1);
    expect(st.lanes[3]).toEqual({ spawned: 2, breaches: 2, blocked: 1, baseDamage: 1 });
    expect(st.lanes[0]).toEqual({ spawned: 1, breaches: 1, blocked: 0, baseDamage: 1 });
    expect(st.baseDamage).toBe(2);
    expect(st.baseHpEnd).toBe(18);
  });

  it("incremental and batch reduction agree", () => {
    const run = runWave({ backpack: bp(), wave: waveDef(2), rng: new Rng(1) });
    const acc = new StatsAccumulator();
    for (const e of run.events) acc.push(e);
    expect(acc.stats).toEqual(reduceWave(run.events));
  });

  it("topDamage orders by damage then key", () => {
    const run = runWave({ backpack: bp(), wave: waveDef(1), rng: new Rng(1) });
    const top = topDamage(reduceWave(run.events), 10);
    for (let i = 1; i < top.length; i++)
      expect(top[i - 1]!.totalDamage).toBeGreaterThanOrEqual(top[i]!.totalDamage);
    expect(top.every((s) => s.totalDamage > 0)).toBe(true);
  });

  it("aggregates across waves", () => {
    const w1 = reduceWave(runWave({ backpack: bp(), wave: waveDef(1), rng: new Rng(1) }).events);
    const w2 = reduceWave(runWave({ backpack: bp(), wave: waveDef(2), rng: new Rng(1) }).events);
    const agg = aggregate([w1, w2]);
    expect(agg.wavesPlayed).toBe(2);
    expect(agg.totalGold).toBe(w1.totalGold + w2.totalGold);
    expect(agg.sources["item:xb"]!.totalDamage).toBe(
      w1.sources["item:xb"]!.totalDamage + w2.sources["item:xb"]!.totalDamage,
    );
    expect(agg.sources["item:xb"]!.shots).toBe(
      w1.sources["item:xb"]!.shots + w2.sources["item:xb"]!.shots,
    );
    expect([1, 2]).toContain(agg.bestWave);
    // aggregate must not mutate its inputs
    expect(w1.sources["item:xb"]!.totalDamage).toBe(
      reduceWave(runWave({ backpack: bp(), wave: waveDef(1), rng: new Rng(1) }).events).sources[
        "item:xb"
      ]!.totalDamage,
    );
  });
});
