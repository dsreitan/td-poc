/**
 * Item shapes and rotation.
 *
 * A shape is a list of cell offsets relative to the item's anchor (its
 * top-left cell after normalisation). Orientation is a number of quarter
 * turns clockwise, 0..3. Rotating always re-normalises so the minimum
 * column and row offset are both zero; the anchor therefore always refers
 * to the top-left cell of the rotated footprint.
 */

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export type Shape = readonly Cell[];

/** Quarter turns clockwise. */
export type Orientation = 0 | 1 | 2 | 3;

export const SHAPE_1X1: Shape = [{ col: 0, row: 0 }];

/** One cell wide, two cells tall in orientation 0 (vertical). */
export const SHAPE_1X2: Shape = [
  { col: 0, row: 0 },
  { col: 0, row: 1 },
];

export function cellKey(c: Cell): string {
  return `${c.col},${c.row}`;
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

/** Sort cells row-major (row, then col) for deterministic iteration. */
export function sortCells(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Shift a shape so its minimum col and row are both 0. */
export function normalize(shape: Shape): Shape {
  if (shape.length === 0) return [];
  let minCol = Infinity;
  let minRow = Infinity;
  for (const c of shape) {
    if (c.col < minCol) minCol = c.col;
    if (c.row < minRow) minRow = c.row;
  }
  return sortCells(shape.map((c) => ({ col: c.col - minCol, row: c.row - minRow })));
}

/** Rotate a shape one quarter turn clockwise and normalise. */
export function rotateOnce(shape: Shape): Shape {
  // (col, row) -> (-row, col) is a clockwise quarter turn in screen space
  // (y down). Normalisation removes the negative offsets.
  return normalize(shape.map((c) => ({ col: -c.row, row: c.col })));
}

/** Shape footprint offsets for a given orientation. */
export function orient(shape: Shape, orientation: Orientation): Shape {
  let s = normalize(shape);
  for (let i = 0; i < orientation; i++) s = rotateOnce(s);
  return s;
}

export function nextOrientation(o: Orientation): Orientation {
  return ((o + 1) % 4) as Orientation;
}

/** Absolute cells occupied by a shape placed with its anchor at `anchor`. */
export function footprint(shape: Shape, orientation: Orientation, anchor: Cell): Cell[] {
  return orient(shape, orientation).map((c) => ({
    col: anchor.col + c.col,
    row: anchor.row + c.row,
  }));
}

/** Width and height of a shape in a given orientation. */
export function bounds(shape: Shape, orientation: Orientation): { w: number; h: number } {
  const s = orient(shape, orientation);
  let w = 0;
  let h = 0;
  for (const c of s) {
    if (c.col + 1 > w) w = c.col + 1;
    if (c.row + 1 > h) h = c.row + 1;
  }
  return { w, h };
}

/** True if two cells share an edge (4-neighbourhood). */
export function areEdgeAdjacent(a: Cell, b: Cell): boolean {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  return dc + dr === 1;
}
