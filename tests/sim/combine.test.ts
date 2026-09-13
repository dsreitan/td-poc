import { describe, expect, it } from "vite-plus/test";
import { Run } from "../../src/sim/Run.ts";
import { itemDef } from "../../src/sim/items/defs.ts";
import { canMerge } from "../../src/sim/items/merge.ts";
import { findRecipe, RECIPES, recipePartners } from "../../src/sim/items/recipes.ts";

const rich = () =>
  new Run({ seed: 21, modifiers: { baseHp: 20, startingGold: 100, rowDelayTicks: 3 } });
function put(
  run: Run,
  id: string,
  defId: string,
  col: number,
  row: number,
  tier: 1 | 2 | 3 = 1,
  orientation: 0 | 1 = 0,
): void {
  const r = run.backpack.place(
    { id, defId, tier, shape: itemDef(defId).shape },
    { col, row },
    orientation,
  );
  if (!r.ok) throw new Error(`put ${id}: ${r.reason}`);
}

describe("merge", () => {
  it("same item, same tier merges into the target; tier 3 does not merge", () => {
    expect(canMerge({ defId: "crossbow", tier: 1 }, { defId: "crossbow", tier: 1 })).toBe(true);
    expect(canMerge({ defId: "crossbow", tier: 1 }, { defId: "crossbow", tier: 2 })).toBe(false);
    expect(canMerge({ defId: "crossbow", tier: 3 }, { defId: "crossbow", tier: 3 })).toBe(false);
    expect(canMerge({ defId: "cannon", tier: 1 }, { defId: "crossbow", tier: 1 })).toBe(false);
  });

  it("grid onto grid: target tiers up, dragged item is consumed, cells freed", () => {
    const run = rich();
    put(run, "a", "crossbow", 0, 0);
    put(run, "b", "crossbow", 1, 0);
    expect(run.previewCombine({ from: "grid", itemId: "a" }, "b")).toEqual({
      kind: "merge",
      resultDefId: "crossbow",
      resultTier: 2,
    });
    const r = run.combine({ from: "grid", itemId: "a" }, "b");
    expect(r).toEqual({ ok: true, kind: "merge", resultId: "b" });
    expect(run.backpack.get("a")).toBeUndefined();
    expect(run.backpack.get("b")?.tier).toBe(2);
    expect(run.backpack.isFree({ col: 0, row: 0 })).toBe(true);
  });

  it("offer onto grid merges and charges gold; unaffordable refuses without change", () => {
    const run = rich();
    const i = run.offers.findIndex((o) => o !== null);
    const defId = run.offers[i]!.defId;
    put(run, "t", defId, 2, 2);
    const gold = run.gold;
    expect(run.combine({ from: "offer", index: i }, "t")).toEqual({
      ok: true,
      kind: "merge",
      resultId: "t",
    });
    expect(run.gold).toBe(gold - itemDef(defId).cost);
    expect(run.offers[i]).toBeNull();
    expect(run.backpack.get("t")?.tier).toBe(2);

    const poor = new Run({
      seed: 21,
      modifiers: { baseHp: 20, startingGold: 0, rowDelayTicks: 3 },
    });
    const j = poor.offers.findIndex((o) => o !== null);
    put(poor, "t", poor.offers[j]!.defId, 2, 2);
    expect(poor.combine({ from: "offer", index: j }, "t")).toEqual({
      ok: false,
      reason: "notEnoughGold",
    });
    expect(poor.backpack.get("t")?.tier).toBe(1);
    expect(poor.offers[j]).not.toBeNull();
  });

  it("bench onto grid merges and empties the bench", () => {
    const run = rich();
    put(run, "t", "gearbox", 0, 4);
    const i = run.offers.findIndex((o) => o !== null);
    // force a gearbox onto the bench regardless of offers
    run.buyToBench(i);
    const benchDef = run.bench!.defId;
    run.sellBench();
    run.backpack.place(
      { id: "g2", defId: "gearbox", tier: 1, shape: itemDef("gearbox").shape },
      { col: 3, row: 4 },
    );
    expect(run.toBench("g2")).toEqual({ ok: true });
    expect(run.combine({ from: "bench" }, "t")).toEqual({ ok: true, kind: "merge", resultId: "t" });
    expect(run.bench).toBeNull();
    expect(run.backpack.get("t")?.tier).toBe(2);
    void benchDef;
  });

  it("refuses self-drop, mismatches, and during a wave", () => {
    const run = rich();
    put(run, "a", "crossbow", 0, 0);
    put(run, "b", "gearbox", 1, 0);
    expect(run.previewCombine({ from: "grid", itemId: "a" }, "a")).toBeUndefined();
    expect(run.combine({ from: "grid", itemId: "a" }, "b")).toEqual({
      ok: false,
      reason: "noCombine",
    });
    run.startWave();
    expect(run.combine({ from: "grid", itemId: "a" }, "b")).toEqual({
      ok: false,
      reason: "locked",
    });
  });
});

describe("recipes", () => {
  it("three recipes, unordered, results are crafted-only items", () => {
    expect(RECIPES).toHaveLength(3);
    for (const r of RECIPES) {
      expect(itemDef(r.result).craftedOnly).toBe(true);
      expect(findRecipe(r.inputs[0], r.inputs[1])?.result).toBe(r.result);
      expect(findRecipe(r.inputs[1], r.inputs[0])?.result).toBe(r.result);
    }
    expect(findRecipe("crossbow", "cannon")).toBeUndefined();
    expect(recipePartners("crossbow")).toEqual(["fire_rune"]);
    expect(recipePartners("coin_purse")).toEqual([]);
  });

  it("fire rune onto crossbow crafts a flaming repeater in the crossbow's cell", () => {
    const run = rich();
    put(run, "xb", "crossbow", 2, 1);
    put(run, "fr", "fire_rune", 3, 1);
    expect(run.previewCombine({ from: "grid", itemId: "fr" }, "xb")).toEqual({
      kind: "craft",
      resultDefId: "flaming_repeater",
      resultTier: 1,
    });
    const r = run.combine({ from: "grid", itemId: "fr" }, "xb");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("craft");
      const res = run.backpack.get(r.resultId)!;
      expect(res.defId).toBe("flaming_repeater");
      expect(res.anchor).toEqual({ col: 2, row: 1 });
    }
    expect(run.backpack.get("xb")).toBeUndefined();
    expect(run.backpack.get("fr")).toBeUndefined();
    expect(run.backpack.count).toBe(1);
  });

  it("crafting is refused when the result shape does not fit", () => {
    const run = rich();
    // frost flask (1x1) onto a cannon (1x2) -> glacier mortar (1x2) fits: ok
    put(run, "cn", "cannon", 0, 0, 1, 1); // horizontal at (0,0),(1,0)
    put(run, "ff", "frost_flask", 2, 0);
    expect(run.previewCombine({ from: "grid", itemId: "ff" }, "cn")?.kind).toBe("craft");
    // reverse direction: cannon dropped onto frost flask -> result 1x2 must fit at the flask's cell
    const run2 = rich();
    put(run2, "ff", "frost_flask", 3, 4); // bottom-right corner: a vertical 1x2 cannot fit
    put(run2, "cn", "cannon", 0, 0);
    expect(run2.previewCombine({ from: "grid", itemId: "cn" }, "ff")).toBeUndefined();
    expect(run2.combine({ from: "grid", itemId: "cn" }, "ff")).toEqual({
      ok: false,
      reason: "doesNotFit",
    });
    expect(run2.backpack.count).toBe(2);
  });
});
