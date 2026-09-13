import { describe, expect, it } from "vite-plus/test";
import { REROLL_BASE_COST, Run } from "../../src/sim/Run.ts";

describe("shop: reroll and bench", () => {
  it("reroll costs 2, then 3, then 4 within a shop, and resets next shop", () => {
    const run = new Run({
      seed: 11,
      modifiers: { baseHp: 20, startingGold: 50, rowDelayTicks: 3 },
    });
    const first = JSON.stringify(run.offers);
    expect(run.rerollCost).toBe(REROLL_BASE_COST);
    expect(run.reroll()).toBe(true);
    expect(run.gold).toBe(48);
    expect(run.rerollCost).toBe(3);
    expect(run.reroll()).toBe(true);
    expect(run.gold).toBe(45);
    expect(run.rerollCost).toBe(4);
    expect(JSON.stringify(run.offers) === first).toBe(false);
    run.startWave();
    while (run.phase === "wave") run.stepWave();
    expect(run.rerollCost).toBe(REROLL_BASE_COST);
  });

  it("reroll refuses when broke or locked", () => {
    const run = new Run({ seed: 11, modifiers: { baseHp: 20, startingGold: 1, rowDelayTicks: 3 } });
    expect(run.reroll()).toBe(false);
    expect(run.gold).toBe(1);
    const rich = new Run({
      seed: 11,
      modifiers: { baseHp: 20, startingGold: 50, rowDelayTicks: 3 },
    });
    rich.startWave();
    expect(rich.reroll()).toBe(false);
  });

  it("bench holds exactly one item, survives a wave, and round-trips to the grid", () => {
    const run = new Run({
      seed: 11,
      modifiers: { baseHp: 20, startingGold: 50, rowDelayTicks: 3 },
    });
    expect(run.fromBench({ col: 0, row: 0 })).toEqual({ ok: false, reason: "benchEmpty" });
    expect(run.buyToBench(0)).toEqual({ ok: true });
    const benched = run.bench!;
    expect(run.buyToBench(1)).toEqual({ ok: false, reason: "benchFull" });
    run.startWave();
    while (run.phase === "wave") run.stepWave();
    expect(run.bench).toEqual(benched);
    expect(run.fromBench({ col: 0, row: 4 })).toEqual({ ok: true });
    expect(run.bench).toBeNull();
    expect(run.backpack.get(benched.id)?.defId).toBe(benched.defId);
    expect(run.toBench(benched.id)).toEqual({ ok: true });
    expect(run.backpack.count).toBe(0);
    const g = run.gold;
    expect(run.sellBench()).toBeGreaterThan(0);
    expect(run.gold).toBeGreaterThan(g);
    expect(run.bench).toBeNull();
  });

  it("fromBench fails atomically when the spot is taken", () => {
    const run = new Run({
      seed: 11,
      modifiers: { baseHp: 20, startingGold: 50, rowDelayTicks: 3 },
    });
    run.buy(0, { col: 0, row: 0 });
    run.buyToBench(1);
    const r = run.fromBench({ col: 0, row: 0 });
    expect(r.ok).toBe(false);
    expect(run.bench).not.toBeNull();
  });
});
