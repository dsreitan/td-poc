import { describe, expect, it } from "vite-plus/test";
import {
  areEdgeAdjacent,
  bounds,
  footprint,
  normalize,
  orient,
  rotateOnce,
  SHAPE_1X1,
  SHAPE_1X2,
  type Shape,
} from "../../src/sim/grid/shapes.ts";

const L_SHAPE: Shape = [
  { col: 0, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
];

describe("shapes", () => {
  it("normalizes to a zero origin, row-major", () => {
    expect(
      normalize([
        { col: 3, row: 2 },
        { col: 2, row: 2 },
      ]),
    ).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it("1x1 is invariant under rotation", () => {
    for (const o of [0, 1, 2, 3] as const) expect(orient(SHAPE_1X1, o)).toEqual(SHAPE_1X1);
  });

  it("1x2 vertical becomes 2x1 horizontal after one turn", () => {
    expect(orient(SHAPE_1X2, 0)).toEqual(SHAPE_1X2);
    expect(orient(SHAPE_1X2, 1)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(orient(SHAPE_1X2, 2)).toEqual(SHAPE_1X2);
    expect(orient(SHAPE_1X2, 3)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it("four rotations are the identity", () => {
    let s = L_SHAPE;
    for (let i = 0; i < 4; i++) s = rotateOnce(s);
    expect(s).toEqual(normalize(L_SHAPE));
  });

  it("rotates an L clockwise", () => {
    // L: (0,0),(0,1),(1,1)  ->  clockwise: (0,0),(1,0),(0,1)
    expect(rotateOnce(L_SHAPE)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
    ]);
  });

  it("computes bounds per orientation", () => {
    expect(bounds(SHAPE_1X2, 0)).toEqual({ w: 1, h: 2 });
    expect(bounds(SHAPE_1X2, 1)).toEqual({ w: 2, h: 1 });
    expect(bounds(L_SHAPE, 0)).toEqual({ w: 2, h: 2 });
  });

  it("footprint offsets from the anchor", () => {
    expect(footprint(SHAPE_1X2, 1, { col: 2, row: 4 })).toEqual([
      { col: 2, row: 4 },
      { col: 3, row: 4 },
    ]);
  });

  it("edge adjacency excludes diagonals and self", () => {
    expect(areEdgeAdjacent({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(true);
    expect(areEdgeAdjacent({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(true);
    expect(areEdgeAdjacent({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(false);
    expect(areEdgeAdjacent({ col: 0, row: 0 }, { col: 0, row: 0 })).toBe(false);
  });
});
