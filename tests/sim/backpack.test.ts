import { describe, expect, it } from "vite-plus/test";
import { Backpack, type ItemSpec } from "../../src/sim/grid/Backpack.ts";
import { SHAPE_1X1, SHAPE_1X2 } from "../../src/sim/grid/shapes.ts";

const one = (id: string): ItemSpec => ({ id, defId: "crossbow", tier: 1, shape: SHAPE_1X1 });
const two = (id: string): ItemSpec => ({ id, defId: "cannon", tier: 1, shape: SHAPE_1X2 });

describe("Backpack placement", () => {
  it("places within bounds and reports occupancy", () => {
    const bp = new Backpack();
    expect(bp.place(one("a"), { col: 0, row: 0 })).toEqual({ ok: true });
    expect(bp.itemAt({ col: 0, row: 0 })?.id).toBe("a");
    expect(bp.isFree({ col: 0, row: 0 })).toBe(false);
    expect(bp.isFree({ col: 1, row: 0 })).toBe(true);
    expect(bp.count).toBe(1);
  });

  it("rejects out-of-bounds placements without mutating", () => {
    const bp = new Backpack();
    const r = bp.place(two("c"), { col: 3, row: 4 }); // vertical, would spill to row 5
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("outOfBounds");
      expect(r.cells).toEqual([{ col: 3, row: 5 }]);
    }
    expect(bp.count).toBe(0);
    expect(bp.isFree({ col: 3, row: 4 })).toBe(true);
  });

  it("rejects overlapping placements and names the cells", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 1, row: 1 });
    const r = bp.place(two("c"), { col: 1, row: 0 }); // covers (1,0),(1,1)
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("occupied");
      expect(r.cells).toEqual([{ col: 1, row: 1 }]);
    }
    expect(bp.has("c")).toBe(false);
  });

  it("rejects duplicate ids", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 0, row: 0 });
    expect(bp.place(one("a"), { col: 1, row: 0 })).toEqual({ ok: false, reason: "duplicateId" });
  });

  it("removes and frees cells", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 2, row: 1 });
    expect(bp.cellsOf("c")).toEqual([
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ]);
    const removed = bp.remove("c");
    expect(removed?.id).toBe("c");
    expect(bp.isFree({ col: 2, row: 1 })).toBe(true);
    expect(bp.isFree({ col: 2, row: 2 })).toBe(true);
    expect(bp.remove("c")).toBeUndefined();
  });

  it("moves an item, allowing overlap with its own old cells", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 0, row: 0 });
    expect(bp.move("c", { col: 0, row: 1 })).toEqual({ ok: true }); // overlaps old (0,1)
    expect(bp.cellsOf("c")).toEqual([
      { col: 0, row: 1 },
      { col: 0, row: 2 },
    ]);
    expect(bp.isFree({ col: 0, row: 0 })).toBe(true);
  });

  it("move fails atomically when blocked", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 0, row: 0 });
    bp.place(one("b"), { col: 1, row: 0 });
    const r = bp.move("a", { col: 1, row: 0 });
    expect(r.ok).toBe(false);
    expect(bp.itemAt({ col: 0, row: 0 })?.id).toBe("a");
    expect(bp.itemAt({ col: 1, row: 0 })?.id).toBe("b");
    expect(bp.move("zzz", { col: 0, row: 0 })).toEqual({ ok: false, reason: "unknownItem" });
  });
});

describe("Backpack rotation", () => {
  it("rotates a 1x2 in open space and changes coverage", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 1, row: 1 }); // vertical: column 1 only
    expect(bp.coverage("c")).toEqual([1]);
    expect(bp.rotate("c")).toEqual({ ok: true });
    expect(bp.get("c")?.orientation).toBe(1);
    expect(bp.cellsOf("c")).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    expect(bp.coverage("c")).toEqual([1, 2]); // horizontal: two lanes
  });

  it("refuses to rotate off the right edge", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 3, row: 0 });
    const r = bp.rotate("c");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("outOfBounds");
    expect(bp.get("c")?.orientation).toBe(0);
    expect(bp.cellsOf("c")).toEqual([
      { col: 3, row: 0 },
      { col: 3, row: 1 },
    ]);
  });

  it("refuses to rotate into a neighbour", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 0, row: 0 });
    bp.place(one("a"), { col: 1, row: 0 });
    const r = bp.rotate("c");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("occupied");
  });

  it("1x1 rotation is always fine and cycles orientation", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 3, row: 4 });
    for (const expected of [1, 2, 3, 0]) {
      expect(bp.rotate("a")).toEqual({ ok: true });
      expect(bp.get("a")?.orientation).toBe(expected);
    }
  });
});

describe("Backpack adjacency and columns", () => {
  it("adjacency is symmetric and edge-only", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 0, row: 0 });
    bp.place(one("b"), { col: 1, row: 0 }); // right of a
    bp.place(one("d"), { col: 1, row: 1 }); // diagonal to a, below b
    expect(bp.areAdjacent("a", "b")).toBe(true);
    expect(bp.areAdjacent("b", "a")).toBe(true);
    expect(bp.areAdjacent("a", "d")).toBe(false);
    expect(bp.areAdjacent("b", "d")).toBe(true);
    expect(bp.areAdjacent("a", "a")).toBe(false);
    expect(bp.neighbours("a").map((i) => i.id)).toEqual(["b"]);
    expect(bp.neighbours("b").map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("a 2-cell item is adjacent via either of its cells", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 1, row: 0 }); // (1,0),(1,1)
    bp.place(one("a"), { col: 0, row: 1 }); // touches lower cell
    bp.place(one("b"), { col: 2, row: 0 }); // touches upper cell
    bp.place(one("x"), { col: 3, row: 3 }); // isolated
    expect(bp.neighbours("c").map((i) => i.id)).toEqual(["a", "b"]);
    expect(bp.neighbours("x")).toEqual([]);
  });

  it("builds a deterministic adjacency graph", () => {
    const bp = new Backpack();
    bp.place(one("z"), { col: 0, row: 0 });
    bp.place(one("m"), { col: 1, row: 0 });
    bp.place(two("a"), { col: 1, row: 1 });
    bp.place(one("q"), { col: 3, row: 4 });
    expect(bp.adjacencyGraph()).toEqual({
      nodes: ["a", "m", "q", "z"],
      edges: [
        ["a", "m"],
        ["m", "z"],
      ],
    });
  });

  it("reports the topmost item per column for the breach rule", () => {
    const bp = new Backpack();
    bp.place(one("low"), { col: 2, row: 4 });
    bp.place(one("high"), { col: 2, row: 1 });
    expect(bp.topItemInColumn(2)?.id).toBe("high");
    expect(bp.topItemInColumn(0)).toBeUndefined();
  });

  it("coverage follows occupied columns", () => {
    const bp = new Backpack();
    bp.place(two("h"), { col: 0, row: 4 }, 1); // horizontal on bottom row: cols 0,1
    expect(bp.coverage("h")).toEqual([0, 1]);
    expect(bp.coverage("nope")).toEqual([]);
  });
});

describe("Backpack serialisation", () => {
  it("round-trips through JSON with identical cells", () => {
    const bp = new Backpack();
    bp.place(two("c"), { col: 2, row: 0 }, 1);
    bp.place(one("a"), { col: 0, row: 4 });
    const copy = Backpack.fromJSON(JSON.parse(JSON.stringify(bp.toJSON())));
    expect(copy.all()).toEqual(bp.all());
    expect(copy.cellsOf("c")).toEqual(bp.cellsOf("c"));
    expect(copy.toString()).toBe(bp.toString());
  });

  it("renders a debug string", () => {
    const bp = new Backpack();
    bp.place(one("a"), { col: 0, row: 0 });
    bp.place(two("b"), { col: 3, row: 3 });
    expect(bp.toString()).toBe(["A...", "....", "....", "...B", "...B"].join("\n"));
  });
});
