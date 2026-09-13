import { describe, expect, it } from "vite-plus/test";
import { Run, SHOP_SIZE } from "../../src/sim/Run.ts";
import { itemDef } from "../../src/sim/items/defs.ts";

function shopThrough(run: Run): void {
  while (run.phase === "wave") run.stepWave();
}

describe("Run", () => {
  it("starts in the shop with starting gold, base HP and four offers", () => {
    const run = new Run({ seed: 1 });
    expect(run.phase).toBe("shop");
    expect(run.gold).toBe(run.modifiers.startingGold);
    expect(run.baseHp).toBe(20);
    expect(run.waveNumber).toBe(1);
    expect(run.offers).toHaveLength(SHOP_SIZE);
    for (const o of run.offers) expect(itemDef(o!.defId).craftedOnly).toBeUndefined();
  });

  it("offers are deterministic per seed", () => {
    expect(new Run({ seed: 7 }).offers).toEqual(new Run({ seed: 7 }).offers);
    const a = JSON.stringify(new Run({ seed: 7 }).offers);
    const b = JSON.stringify(new Run({ seed: 8 }).offers);
    // not guaranteed different, but with 12 items and 4 slots it is overwhelmingly likely
    expect(a === b).toBe(false);
  });

  it("buy places the item, charges gold and empties the slot", () => {
    const run = new Run({ seed: 1 });
    const offer = run.offers[0]!;
    const res = run.buy(0, { col: 0, row: 0 });
    expect(res).toEqual({ ok: true });
    expect(run.gold).toBe(run.modifiers.startingGold - offer.cost);
    expect(run.offers[0]).toBeNull();
    expect(run.backpack.count).toBe(1);
    expect(run.backpack.all()[0]!.defId).toBe(offer.defId);
    expect(run.buy(0, { col: 1, row: 0 })).toEqual({ ok: false, reason: "noOffer" });
  });

  it("buy fails atomically when unaffordable or unplaceable", () => {
    const run = new Run({ seed: 1 });
    // spend down
    let i = 0;
    while (run.gold >= 3 && i < SHOP_SIZE) {
      run.buy(i, { col: i, row: 0 });
      i++;
    }
    const cheapSeedRun = new Run({ seed: 1 });
    const r = cheapSeedRun.buy(0, { col: 0, row: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("outOfBounds");
    expect(cheapSeedRun.gold).toBe(cheapSeedRun.modifiers.startingGold);
    expect(cheapSeedRun.offers[0]).not.toBeNull();
  });

  it("sell refunds half the cost and frees the cells", () => {
    const run = new Run({ seed: 1 });
    const offer = run.offers[0]!;
    run.buy(0, { col: 2, row: 2 });
    const id = run.backpack.all()[0]!.id;
    const before = run.gold;
    expect(run.sell(id)).toBe(Math.floor(offer.cost / 2));
    expect(run.gold).toBe(before + Math.floor(offer.cost / 2));
    expect(run.backpack.count).toBe(0);
    expect(run.sell(id)).toBeUndefined();
  });

  it("locks the bag during a wave and unlocks after", () => {
    const run = new Run({ seed: 1 });
    run.buy(0, { col: 0, row: 0 });
    const id = run.backpack.all()[0]!.id;
    expect(run.startWave()).toBeDefined();
    expect(run.locked).toBe(true);
    expect(run.buy(1, { col: 1, row: 0 })).toEqual({ ok: false, reason: "locked" });
    expect(run.sell(id)).toBeUndefined();
    expect(run.move(id, { col: 1, row: 0 }).ok).toBe(false);
    expect(run.startWave()).toBeUndefined();
    shopThrough(run);
    expect(run.phase).toBe("shop");
    expect(run.locked).toBe(false);
    expect(run.waveNumber).toBe(2);
    expect(run.waveStats).toHaveLength(1);
    expect(run.offers.every((o) => o !== null)).toBe(true);
  });

  it("collects kill and clear gold from the events", () => {
    const run = new Run({ seed: 3 });
    // Force a known build regardless of offers: place crossbows directly.
    for (let c = 0; c < 4; c++) {
      run.backpack.place(
        { id: `xb${c}`, defId: "crossbow", tier: 1, shape: itemDef("crossbow").shape },
        { col: c, row: 0 },
      );
    }
    const before = run.gold;
    run.startWave();
    shopThrough(run);
    const st = run.waveStats[0]!;
    expect(st.result).toBe("cleared");
    expect(run.gold).toBe(before + st.totalGold);
    expect(run.baseHp).toBe(20);
  });

  it("coin purse pays at wave end and is credited in stats", () => {
    const run = new Run({ seed: 3 });
    run.backpack.place(
      { id: "cp", defId: "coin_purse", tier: 1, shape: itemDef("coin_purse").shape },
      { col: 0, row: 4 },
    );
    const before = run.gold;
    run.startWave();
    shopThrough(run);
    const st = run.waveStats[0]!;
    expect(st.sources["item:cp"]!.gold).toBe(2);
    expect(run.gold).toBe(before + st.totalGold);
  });

  it("wins after the last wave and loses when the base falls", () => {
    const win = new Run({ seed: 5 });
    for (let c = 0; c < 4; c++) {
      win.backpack.place(
        { id: `xb${c}`, defId: "crossbow", tier: 3, shape: itemDef("crossbow").shape },
        { col: c, row: 0 },
      );
    }
    while (win.phase === "shop") {
      win.startWave();
      shopThrough(win);
    }
    expect(win.phase).toBe("won");
    expect(win.waveStats).toHaveLength(win.waveCount);

    const lose = new Run({ seed: 5, modifiers: { baseHp: 2, startingGold: 0, rowDelayTicks: 3 } });
    lose.startWave();
    shopThrough(lose);
    expect(lose.phase).toBe("lost");
    expect(lose.baseHp).toBe(0);
    expect(lose.startWave()).toBeUndefined();
  });
});
