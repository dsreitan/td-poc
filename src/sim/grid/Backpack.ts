/**
 * The backpack grid: placement, rotation, adjacency and column coverage.
 *
 * Pure data structure. Mutating methods return a PlacementResult and leave
 * the grid untouched on failure. Item instance ids are assigned by the
 * caller (the Run) so that ids stay deterministic across replays.
 *
 * Coordinates: column 0..COLS-1 left to right, row 0 is the TOP row (nearest
 * the enemies). Column x is enemy lane x. See docs/PLAN.md §2.1.
 */

import {
  areEdgeAdjacent,
  cellKey,
  footprint,
  nextOrientation,
  sortCells,
  type Cell,
  type Orientation,
  type Shape,
} from "./shapes.ts";

export const GRID_COLS = 4;
export const GRID_ROWS = 5;

export interface GridSize {
  readonly cols: number;
  readonly rows: number;
}

export const DEFAULT_GRID: GridSize = { cols: GRID_COLS, rows: GRID_ROWS };

/** An item as placed in the grid. `shape` is copied from its definition. */
export interface PlacedItem {
  readonly id: string;
  readonly defId: string;
  readonly tier: 1 | 2 | 3;
  readonly shape: Shape;
  readonly anchor: Cell;
  readonly orientation: Orientation;
}

export type PlacementFailure = "outOfBounds" | "occupied" | "unknownItem" | "duplicateId";

export type PlacementResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PlacementFailure; readonly cells?: readonly Cell[] };

export interface AdjacencyGraph {
  /** Item ids, sorted. */
  readonly nodes: readonly string[];
  /** Undirected edges as [a, b] with a < b, sorted. */
  readonly edges: readonly (readonly [string, string])[];
}

export interface ItemSpec {
  readonly id: string;
  readonly defId: string;
  readonly tier: 1 | 2 | 3;
  readonly shape: Shape;
}

export class Backpack {
  readonly size: GridSize;
  private readonly items = new Map<string, PlacedItem>();
  /** cellKey -> item id */
  private readonly occupancy = new Map<string, string>();

  constructor(size: GridSize = DEFAULT_GRID) {
    this.size = size;
  }

  // ---------------------------------------------------------------- queries

  get(id: string): PlacedItem | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** All items, sorted by id for deterministic iteration. */
  all(): PlacedItem[] {
    return [...this.items.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  get count(): number {
    return this.items.size;
  }

  inBounds(c: Cell): boolean {
    return c.col >= 0 && c.col < this.size.cols && c.row >= 0 && c.row < this.size.rows;
  }

  itemAt(c: Cell): PlacedItem | undefined {
    const id = this.occupancy.get(cellKey(c));
    return id === undefined ? undefined : this.items.get(id);
  }

  isFree(c: Cell): boolean {
    return this.inBounds(c) && !this.occupancy.has(cellKey(c));
  }

  /** Absolute cells occupied by an item, row-major. */
  cellsOf(id: string): Cell[] {
    const it = this.items.get(id);
    if (!it) return [];
    return sortCells(footprint(it.shape, it.orientation, it.anchor));
  }

  /** Columns (= lanes) an item occupies, ascending, unique. */
  coverage(id: string): number[] {
    const cols = new Set<number>();
    for (const c of this.cellsOf(id)) cols.add(c.col);
    return [...cols].sort((a, b) => a - b);
  }

  /** Topmost item in a column (lowest row index), or undefined if empty. */
  topItemInColumn(col: number): PlacedItem | undefined {
    for (let row = 0; row < this.size.rows; row++) {
      const it = this.itemAt({ col, row });
      if (it) return it;
    }
    return undefined;
  }

  /** Items sharing an edge with the given item, sorted by id. */
  neighbours(id: string): PlacedItem[] {
    const mine = this.cellsOf(id);
    const found = new Map<string, PlacedItem>();
    for (const c of mine) {
      const around: Cell[] = [
        { col: c.col + 1, row: c.row },
        { col: c.col - 1, row: c.row },
        { col: c.col, row: c.row + 1 },
        { col: c.col, row: c.row - 1 },
      ];
      for (const n of around) {
        const other = this.itemAt(n);
        if (other && other.id !== id) found.set(other.id, other);
      }
    }
    return [...found.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  areAdjacent(a: string, b: string): boolean {
    if (a === b) return false;
    const ca = this.cellsOf(a);
    const cb = this.cellsOf(b);
    for (const x of ca) for (const y of cb) if (areEdgeAdjacent(x, y)) return true;
    return false;
  }

  /** Full adjacency graph, deterministic ordering. Cached by WaveSim. */
  adjacencyGraph(): AdjacencyGraph {
    const nodes = this.all().map((i) => i.id);
    const edges: [string, string][] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!;
        if (this.areAdjacent(a, b)) edges.push([a, b]);
      }
    }
    return { nodes, edges };
  }

  /**
   * Check whether an item could occupy the given cells, ignoring the cells
   * currently held by `ignoreId` (used for move/rotate of the same item).
   */
  canOccupy(cells: readonly Cell[], ignoreId?: string): PlacementResult {
    const oob = cells.filter((c) => !this.inBounds(c));
    if (oob.length > 0) return { ok: false, reason: "outOfBounds", cells: oob };
    const taken = cells.filter((c) => {
      const holder = this.occupancy.get(cellKey(c));
      return holder !== undefined && holder !== ignoreId;
    });
    if (taken.length > 0) return { ok: false, reason: "occupied", cells: taken };
    return { ok: true };
  }

  /** Validate a hypothetical placement without applying it. */
  canPlace(
    shape: Shape,
    orientation: Orientation,
    anchor: Cell,
    ignoreId?: string,
  ): PlacementResult {
    return this.canOccupy(footprint(shape, orientation, anchor), ignoreId);
  }

  // -------------------------------------------------------------- mutations

  place(spec: ItemSpec, anchor: Cell, orientation: Orientation = 0): PlacementResult {
    if (this.items.has(spec.id)) return { ok: false, reason: "duplicateId" };
    const cells = footprint(spec.shape, orientation, anchor);
    const check = this.canOccupy(cells);
    if (!check.ok) return check;
    const placed: PlacedItem = {
      id: spec.id,
      defId: spec.defId,
      tier: spec.tier,
      shape: spec.shape,
      anchor,
      orientation,
    };
    this.items.set(spec.id, placed);
    for (const c of cells) this.occupancy.set(cellKey(c), spec.id);
    return { ok: true };
  }

  remove(id: string): PlacedItem | undefined {
    const it = this.items.get(id);
    if (!it) return undefined;
    for (const c of this.cellsOf(id)) this.occupancy.delete(cellKey(c));
    this.items.delete(id);
    return it;
  }

  /** Move (and optionally re-orient) an existing item. Atomic. */
  move(id: string, anchor: Cell, orientation?: Orientation): PlacementResult {
    const it = this.items.get(id);
    if (!it) return { ok: false, reason: "unknownItem" };
    const o = orientation ?? it.orientation;
    const cells = footprint(it.shape, o, anchor);
    const check = this.canOccupy(cells, id);
    if (!check.ok) return check;
    for (const c of this.cellsOf(id)) this.occupancy.delete(cellKey(c));
    const moved: PlacedItem = { ...it, anchor, orientation: o };
    this.items.set(id, moved);
    for (const c of cells) this.occupancy.set(cellKey(c), id);
    return { ok: true };
  }

  /** Rotate an item a quarter turn clockwise in place (same anchor). */
  rotate(id: string): PlacementResult {
    const it = this.items.get(id);
    if (!it) return { ok: false, reason: "unknownItem" };
    return this.move(id, it.anchor, nextOrientation(it.orientation));
  }

  clear(): void {
    this.items.clear();
    this.occupancy.clear();
  }

  // ------------------------------------------------------------ serialise

  /** Plain data for saves and replays. Sorted by id. */
  toJSON(): { size: GridSize; items: PlacedItem[] } {
    return { size: this.size, items: this.all() };
  }

  static fromJSON(data: { size: GridSize; items: readonly PlacedItem[] }): Backpack {
    const bp = new Backpack(data.size);
    for (const it of data.items) {
      const res = bp.place(
        { id: it.id, defId: it.defId, tier: it.tier, shape: it.shape },
        it.anchor,
        it.orientation,
      );
      if (!res.ok) throw new Error(`Backpack.fromJSON: cannot place ${it.id}: ${res.reason}`);
    }
    return bp;
  }

  /** Debug rendering: one char per cell, '.' for empty. */
  toString(): string {
    const label = new Map<string, string>();
    let n = 0;
    for (const it of this.all()) label.set(it.id, String.fromCharCode(65 + (n++ % 26)));
    const lines: string[] = [];
    for (let row = 0; row < this.size.rows; row++) {
      let line = "";
      for (let col = 0; col < this.size.cols; col++) {
        const it = this.itemAt({ col, row });
        line += it ? label.get(it.id) : ".";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
}
