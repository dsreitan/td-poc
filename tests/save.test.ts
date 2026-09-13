import { describe, expect, it } from "vite-plus/test";
import { Run } from "../src/sim/Run.ts";
import { itemDef } from "../src/sim/items/defs.ts";
import { aggregate } from "../src/sim/stats/aggregate.ts";
import {
  clearRun,
  HISTORY_MAX,
  historyEntry,
  loadHistory,
  loadRun,
  MemoryStore,
  recordRun,
  RUN_KEY,
  saveRun,
} from "../src/save/storage.ts";

function playOneWave(run: Run): void {
  run.startWave();
  while (run.phase === "wave") run.stepWave();
}

describe("Run save/restore", () => {
  it("round-trips through JSON and continues identically", () => {
    const a = new Run({ seed: 77 });
    a.buy(0, { col: 0, row: 0 });
    a.buyToBench(1);
    a.reroll();
    playOneWave(a);
    a.buy(0, { col: 1, row: 0 });
    const save = a.toSave()!;
    expect(save.v).toBe(1);
    expect(save.waveIndex).toBe(1);

    const b = Run.restore(JSON.parse(JSON.stringify(save)));
    expect(b.phase).toBe("shop");
    expect(b.gold).toBe(a.gold);
    expect(b.baseHp).toBe(a.baseHp);
    expect(b.waveNumber).toBe(a.waveNumber);
    expect(b.offers).toEqual(a.offers);
    expect(b.bench).toEqual(a.bench);
    expect(b.rerollCost).toBe(a.rerollCost);
    expect(b.backpack.toString()).toBe(a.backpack.toString());
    expect(b.waveStats).toEqual(a.waveStats);

    // Same future: next reroll yields the same offers, next wave the same result.
    a.reroll();
    b.reroll();
    expect(b.offers).toEqual(a.offers);
    playOneWave(a);
    playOneWave(b);
    expect(b.waveStats.at(-1)).toEqual(a.waveStats.at(-1));
    expect(b.gold).toBe(a.gold);
  });

  it("new item ids do not collide after restore", () => {
    const a = new Run({ seed: 5 });
    a.buy(0, { col: 0, row: 0 });
    const b = Run.restore(a.toSave()!);
    b.buy(1, { col: 1, row: 0 });
    expect(new Set(b.backpack.all().map((i) => i.id)).size).toBe(2);
  });

  it("has no save during a wave, and rejects other versions", () => {
    const a = new Run({ seed: 5 });
    a.startWave();
    expect(a.toSave()).toBeUndefined();
    const bad = { ...new Run({ seed: 5 }).toSave()!, v: 2 as unknown as 1 };
    expect(() => Run.restore(bad)).toThrow(/version/);
  });
});

describe("storage", () => {
  it("saves, loads and clears the run", () => {
    const store = new MemoryStore();
    expect(loadRun(store)).toBeUndefined();
    const save = new Run({ seed: 9 }).toSave()!;
    expect(saveRun(store, save)).toBe(true);
    expect(loadRun(store)).toEqual(save);
    clearRun(store);
    expect(loadRun(store)).toBeUndefined();
  });

  it("treats garbage as absent", () => {
    const store = new MemoryStore();
    store.setItem(RUN_KEY, "{not json");
    expect(loadRun(store)).toBeUndefined();
    store.setItem(RUN_KEY, JSON.stringify({ v: 99 }));
    expect(loadRun(store)).toBeUndefined();
  });

  it("keeps a bounded, newest-first history", () => {
    const store = new MemoryStore();
    const run = new Run({ seed: 3 });
    run.backpack.place(
      { id: "xb", defId: "crossbow", tier: 3, shape: itemDef("crossbow").shape },
      { col: 1, row: 0 },
    );
    playOneWave(run);
    const entry = historyEntry(
      run.seed,
      "lost",
      aggregate(run.waveStats),
      new Date("2026-09-13T12:00:00Z"),
    );
    expect(entry.topSource?.key).toBe("item:xb");
    expect(entry.wavesPlayed).toBe(1);
    for (let i = 0; i < HISTORY_MAX + 5; i++) recordRun(store, { ...entry, seed: i });
    const h = loadHistory(store);
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0]!.seed).toBe(HISTORY_MAX + 4);
  });
});
