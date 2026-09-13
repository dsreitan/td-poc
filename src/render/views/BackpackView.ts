import Phaser from "phaser";
import { CONTENT, itemText } from "../../content/index.ts";
import type { DragSource, Run } from "../../sim/Run.ts";
import type { PlacedItem } from "../../sim/grid/Backpack.ts";
import { footprint, nextOrientation, type Cell, type Orientation } from "../../sim/grid/shapes.ts";
import { itemDef } from "../../sim/items/defs.ts";
import {
  CELL,
  COLORS,
  GRID_COLS,
  GRID_ROWS,
  ITEM_CLASS_COLORS,
  cellToXY,
  inBench,
  inSellZone,
  xyToCell,
} from "../layout.ts";

export interface DragHooks {
  /** Called while dragging with the lanes the item would cover at the hovered anchor. */
  onHover(lanes: readonly number[] | undefined, sellHover: boolean): void;
  onChanged(): void;
}

interface ItemView {
  item: PlacedItem;
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * The 4x5 grid with placed items. Drag to move, tap to rotate, drop on the
 * shop row to sell. Dragging from the shop is handled by ShopView, which
 * calls `beginExternalDrag` here so both share one ghost/highlight path.
 */
export class BackpackView {
  private readonly scene: Phaser.Scene;
  private readonly run: Run;
  private readonly hooks: DragHooks;
  private readonly views = new Map<string, ItemView>();
  private readonly ghost: Phaser.GameObjects.Graphics;
  private locked = false;

  constructor(scene: Phaser.Scene, run: Run, hooks: DragHooks) {
    this.scene = scene;
    this.run = run;
    this.hooks = hooks;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = cellToXY(col, row);
        scene.add
          .rectangle(x + 2, y + 2, CELL - 4, CELL - 4, COLORS.gridCell)
          .setOrigin(0, 0)
          .setStrokeStyle(1, COLORS.gridLine);
      }
    }
    this.ghost = scene.add.graphics().setDepth(2);
    scene.input.dragDistanceThreshold = 6;
    this.sync();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    for (const v of this.views.values()) v.body.setAlpha(locked ? 0.85 : 1);
  }

  /** Rebuild item views from the backpack. Cheap at this scale. */
  sync(): void {
    const seen = new Set<string>();
    for (const item of this.run.backpack.all()) {
      seen.add(item.id);
      let v = this.views.get(item.id);
      if (!v) {
        v = this.createView(item);
        this.views.set(item.id, v);
      } else {
        v.item = item;
      }
      this.layout(v);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.root.destroy();
        this.views.delete(id);
      }
    }
  }

  private createView(item: PlacedItem): ItemView {
    const def = itemDef(item.defId);
    const color = ITEM_CLASS_COLORS[def.itemClass] ?? 0xffffff;
    const body = this.scene.add
      .rectangle(0, 0, CELL - 8, CELL - 8, color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x000000, 0.35);
    const label = this.scene.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: COLORS.textDark,
        align: "center",
        wordWrap: { width: CELL - 12 },
      })
      .setOrigin(0.5, 0.5);
    const root = this.scene.add.container(0, 0, [body, label]).setDepth(3);
    root.setSize(CELL - 8, CELL - 8);
    root.setInteractive({ draggable: true, useHandCursor: true });

    let dragging = false;
    let grab: Cell = { col: 0, row: 0 };
    let orientation: Orientation = item.orientation;
    root.on("dragstart", (pointer: Phaser.Input.Pointer) => {
      if (this.locked) return;
      dragging = true;
      orientation = this.views.get(item.id)!.item.orientation;
      const cell = xyToCell(pointer.x, pointer.y);
      const cur = this.views.get(item.id)!.item;
      grab = cell
        ? { col: cell.col - cur.anchor.col, row: cell.row - cur.anchor.row }
        : { col: 0, row: 0 };
      root.setDepth(10);
      body.setAlpha(0.8);
    });
    root.on("drag", (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (!dragging) return;
      root.setPosition(dragX, dragY);
      this.previewAt(pointer, item.id, orientation, grab);
    });
    root.on("dragend", (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      dragging = false;
      body.setAlpha(1);
      root.setDepth(3);
      this.ghost.clear();
      this.hooks.onHover(undefined, false);
      const cur = this.views.get(item.id)?.item;
      if (!cur) return;
      const target = this.combineTargetAt(pointer, { from: "grid", itemId: item.id });
      if (target) {
        this.run.combine({ from: "grid", itemId: item.id }, target);
      } else if (inBench(pointer.x, pointer.y)) {
        this.run.toBench(item.id);
      } else if (inSellZone(pointer.x, pointer.y)) {
        this.run.sell(item.id);
      } else {
        const anchor = this.anchorFor(pointer, grab);
        if (anchor) this.run.move(item.id, anchor, orientation);
      }
      this.sync();
      this.hooks.onChanged();
    });
    root.on("pointerup", () => {
      if (dragging || this.locked) return;
      // A tap without a drag rotates in place.
      this.run.rotate(item.id);
      this.sync();
      this.hooks.onChanged();
    });
    return { item, root, body, label };
  }

  private layout(v: ItemView): void {
    const cells = footprint(v.item.shape, v.item.orientation, v.item.anchor);
    let minC = Infinity,
      minR = Infinity,
      maxC = -Infinity,
      maxR = -Infinity;
    for (const c of cells) {
      minC = Math.min(minC, c.col);
      maxC = Math.max(maxC, c.col);
      minR = Math.min(minR, c.row);
      maxR = Math.max(maxR, c.row);
    }
    const w = (maxC - minC + 1) * CELL - 8;
    const h = (maxR - minR + 1) * CELL - 8;
    const { x, y } = cellToXY(minC, minR);
    v.root.setPosition(x + 4, y + 4);
    v.root.setSize(w, h);
    v.root.input?.hitArea?.setTo?.(0, 0, w, h);
    v.body.setSize(w, h);
    const text = itemText(CONTENT, v.item.defId);
    const tier = v.item.tier > 1 ? ` ${"★".repeat(v.item.tier - 1)}` : "";
    v.label.setText(`${text.name}${tier}`);
    // Long single words (e.g. "Ammunition") must not clip in one cell.
    const longest = Math.max(...text.name.split(" ").map((p) => p.length));
    v.label.setFontSize(longest > 8 ? "9px" : "11px");
    v.label.setWordWrapWidth(w - 6);
    v.label.setPosition(w / 2, h / 2);
  }

  private anchorFor(pointer: Phaser.Input.Pointer, grab: Cell): Cell | undefined {
    const cell = xyToCell(pointer.x, pointer.y);
    if (!cell) return undefined;
    return { col: cell.col - grab.col, row: cell.row - grab.row };
  }

  /** Draw the placement ghost and report lane coverage while dragging. */
  private previewAt(
    pointer: Phaser.Input.Pointer,
    ignoreId: string | undefined,
    orientation: Orientation,
    grab: Cell,
    shapeDefId?: string,
  ): void {
    this.ghost.clear();
    if (inSellZone(pointer.x, pointer.y)) {
      this.hooks.onHover(undefined, true);
      return;
    }
    if (inBench(pointer.x, pointer.y)) {
      this.hooks.onHover(undefined, false);
      return;
    }
    const anchor = this.anchorFor(pointer, grab);
    if (!anchor) {
      this.hooks.onHover(undefined, false);
      return;
    }
    const src: DragSource = shapeDefId
      ? (this.externalSource ?? { from: "bench" })
      : { from: "grid", itemId: ignoreId! };
    const target = this.combineTargetAt(pointer, src);
    if (target) {
      const pv = this.run.previewCombine(src, target)!;
      this.ghost.fillStyle(pv.kind === "merge" ? COLORS.ok : COLORS.gold, 0.55);
      for (const c of this.run.backpack.cellsOf(target)) {
        const { x, y } = cellToXY(c.col, c.row);
        this.ghost.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }
      this.hooks.onHover(this.run.backpack.coverage(target), false);
      return;
    }
    const shape = shapeDefId ? itemDef(shapeDefId).shape : this.run.backpack.get(ignoreId!)!.shape;
    const cells = footprint(shape, orientation, anchor);
    const res = this.run.backpack.canPlace(shape, orientation, anchor, ignoreId);
    this.ghost.fillStyle(res.ok ? COLORS.ok : COLORS.bad, 0.35);
    for (const c of cells) {
      if (c.col < 0 || c.col >= GRID_COLS || c.row < 0 || c.row >= GRID_ROWS) continue;
      const { x, y } = cellToXY(c.col, c.row);
      this.ghost.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    }
    const lanes = [...new Set(cells.map((c) => c.col))].filter((c) => c >= 0 && c < GRID_COLS);
    this.hooks.onHover(res.ok ? lanes : [], false);
  }

  // ---- external drags (from the shop) share the ghost path

  private externalSource: DragSource | undefined;

  externalPreview(
    pointer: Phaser.Input.Pointer,
    defId: string,
    orientation: Orientation,
    src: DragSource,
  ): void {
    this.externalSource = src;
    this.previewAt(pointer, undefined, orientation, { col: 0, row: 0 }, defId);
  }

  /** Grid item under the pointer that `src` could merge into or craft with. */
  combineTargetAt(pointer: Phaser.Input.Pointer, src: DragSource): string | undefined {
    const cell = xyToCell(pointer.x, pointer.y);
    if (!cell) return undefined;
    const hit = this.run.backpack.itemAt(cell);
    if (!hit) return undefined;
    if (src.from === "grid" && src.itemId === hit.id) return undefined;
    return this.run.previewCombine(src, hit.id) ? hit.id : undefined;
  }

  externalDrop(): void {
    this.ghost.clear();
    this.externalSource = undefined;
    this.hooks.onHover(undefined, false);
  }

  /** Grid anchor under the pointer for a 1-cell grab offset, or undefined outside the grid. */
  anchorAt(pointer: Phaser.Input.Pointer): Cell | undefined {
    return this.anchorFor(pointer, { col: 0, row: 0 });
  }

  static rotate(o: Orientation): Orientation {
    return nextOrientation(o);
  }
}
