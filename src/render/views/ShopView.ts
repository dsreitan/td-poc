import Phaser from "phaser";
import { CONTENT, itemText, ui } from "../../content/index.ts";
import type { DragSource, Run } from "../../sim/Run.ts";
import type { Orientation } from "../../sim/grid/shapes.ts";
import { itemDef } from "../../sim/items/defs.ts";
import {
  BENCH_W,
  BENCH_X,
  COLORS,
  ITEM_CLASS_COLORS,
  REROLL_W,
  REROLL_X,
  SHOP_A_H,
  SHOP_A_Y,
  SHOP_B_H,
  SHOP_B_Y,
  SHOP_H,
  SHOP_SLOT,
  SHOP_X,
  SHOP_Y,
  START_BTN_W,
  START_BTN_X,
  VIEW_W,
  inBench,
} from "../layout.ts";
import type { BackpackView } from "./BackpackView.ts";

interface Card {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  home: { x: number; y: number };
}

interface Drop {
  pointer: Phaser.Input.Pointer;
  orientation: Orientation;
}

/** Row A: four offers + reroll. Row B: bench slot + start. Whole area is the sell zone. */
export class ShopView {
  private readonly scene: Phaser.Scene;
  private readonly run: Run;
  private readonly backpackView: BackpackView;
  private readonly onChanged: () => void;
  private readonly offers: Card[] = [];
  private readonly bench: Card;
  private readonly sellHint: Phaser.GameObjects.Text;
  private readonly rowBg: Phaser.GameObjects.Rectangle;
  private readonly benchBg: Phaser.GameObjects.Rectangle;
  private readonly rerollBtn: Phaser.GameObjects.Rectangle;
  private readonly rerollText: Phaser.GameObjects.Text;
  private readonly startBtn: Phaser.GameObjects.Rectangle;
  private readonly startText: Phaser.GameObjects.Text;
  private locked = false;

  constructor(
    scene: Phaser.Scene,
    run: Run,
    backpackView: BackpackView,
    onChanged: () => void,
    onStart: () => void,
  ) {
    this.scene = scene;
    this.run = run;
    this.backpackView = backpackView;
    this.onChanged = onChanged;
    const font = {
      fontFamily: "monospace",
      fontSize: "11px",
      color: COLORS.text,
      align: "center" as const,
    };

    this.rowBg = scene.add
      .rectangle(0, SHOP_Y, VIEW_W, SHOP_H, COLORS.panel)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLORS.gridLine);
    this.sellHint = scene.add
      .text(
        SHOP_X + SHOP_SLOT * 2,
        SHOP_A_Y + SHOP_A_H / 2,
        `${ui(CONTENT, "sell").toUpperCase()} ↓`,
        { ...font, fontSize: "16px" },
      )
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(3);

    for (let i = 0; i < 4; i++) {
      // Card centre. Containers hit-test around their centre, so children are drawn centred too.
      const home = {
        x: SHOP_X + i * SHOP_SLOT + (SHOP_SLOT - 4) / 2,
        y: SHOP_A_Y + 3 + (SHOP_A_H - 6) / 2,
      };
      this.offers.push(
        this.createCard(
          home,
          SHOP_SLOT - 4,
          SHOP_A_H - 6,
          () => ({ from: "offer", index: i }),
          (o) => this.dropOffer(i, o),
        ),
      );
    }

    this.rerollBtn = scene.add
      .rectangle(REROLL_X, SHOP_A_Y + 3, REROLL_W, SHOP_A_H - 6, COLORS.gridLine)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.rerollText = scene.add
      .text(REROLL_X + REROLL_W / 2, SHOP_A_Y + SHOP_A_H / 2, "", {
        ...font,
        wordWrap: { width: REROLL_W - 6 },
      })
      .setOrigin(0.5);
    this.rerollBtn.on("pointerup", () => {
      if (this.locked) return;
      if (this.run.reroll()) this.onChanged();
      else this.shake(this.rerollText);
    });

    this.benchBg = scene.add
      .rectangle(BENCH_X, SHOP_B_Y + 3, BENCH_W, SHOP_B_H - 6, COLORS.gridCell)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLORS.gridLine);
    scene.add
      .text(BENCH_X + BENCH_W / 2, SHOP_B_Y + SHOP_B_H / 2, ui(CONTENT, "bench"), {
        ...font,
        color: COLORS.muted,
        fontSize: "10px",
      })
      .setOrigin(0.5);
    this.bench = this.createCard(
      { x: BENCH_X + BENCH_W / 2, y: SHOP_B_Y + 3 + (SHOP_B_H - 6) / 2 },
      BENCH_W,
      SHOP_B_H - 6,
      () => ({ from: "bench" }),
      (o) => this.dropBench(o),
    );

    this.startBtn = scene.add
      .rectangle(START_BTN_X, SHOP_B_Y + 3, START_BTN_W, SHOP_B_H - 6, COLORS.accent)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.startText = scene.add
      .text(START_BTN_X + START_BTN_W / 2, SHOP_B_Y + SHOP_B_H / 2, "", {
        ...font,
        fontSize: "14px",
      })
      .setOrigin(0.5);
    this.startBtn.on("pointerup", () => {
      if (!this.locked) onStart();
    });
    this.sync();
  }

  /** A draggable card. The def id is stored on the container so cards can be repainted. */
  private createCard(
    home: { x: number; y: number },
    w: number,
    h: number,
    source: () => DragSource,
    onDrop: (o: Drop) => void,
  ): Card {
    const body = this.scene.add.rectangle(0, 0, w, h, 0x000000).setStrokeStyle(1, 0x000000, 0.3);
    const name = this.scene.add
      .text(0, -h / 2 + 6, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: COLORS.textDark,
        align: "center",
        wordWrap: { width: w - 6 },
      })
      .setOrigin(0.5, 0);
    const cost = this.scene.add
      .text(0, h / 2 - 10, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: COLORS.textDark,
      })
      .setOrigin(0.5, 0.5);
    const root = this.scene.add.container(home.x, home.y, [body, name, cost]).setDepth(3);
    root.setSize(w, h);
    root.setInteractive({ draggable: true, useHandCursor: true });
    const card: Card = { root, body, name, cost, home };

    let dragging = false;
    const orientation: Orientation = 0;
    root.on("dragstart", () => {
      if (this.locked || !root.getData("defId")) return;
      dragging = true;
      root.setDepth(10);
    });
    root.on("drag", (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (!dragging) return;
      root.setPosition(dragX, dragY);
      this.backpackView.externalPreview(
        pointer,
        root.getData("defId") as string,
        orientation,
        source(),
      );
    });
    root.on("dragend", (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      dragging = false;
      root.setDepth(3);
      this.backpackView.externalDrop();
      onDrop({ pointer, orientation });
      root.setPosition(home.x, home.y);
      this.sync();
      this.onChanged();
    });
    return card;
  }

  private dropOffer(i: number, { pointer, orientation }: Drop): void {
    const src: DragSource = { from: "offer", index: i };
    const target = this.backpackView.combineTargetAt(pointer, src);
    if (target) {
      if (!this.run.combine(src, target).ok) this.shake(this.offers[i]!.root);
      return;
    }
    if (inBench(pointer.x, pointer.y)) {
      if (!this.run.buyToBench(i).ok) this.shake(this.offers[i]!.root);
      return;
    }
    const anchor = this.backpackView.anchorAt(pointer);
    if (!anchor) return;
    if (!this.run.buy(i, anchor, orientation).ok) this.shake(this.offers[i]!.root);
  }

  private dropBench({ pointer, orientation }: Drop): void {
    if (inBench(pointer.x, pointer.y)) return;
    const src: DragSource = { from: "bench" };
    const target = this.backpackView.combineTargetAt(pointer, src);
    if (target) {
      if (!this.run.combine(src, target).ok) this.shake(this.bench.root);
      return;
    }
    const anchor = this.backpackView.anchorAt(pointer);
    if (anchor) {
      if (!this.run.fromBench(anchor, orientation).ok) this.shake(this.bench.root);
      return;
    }
    // Dropped in the shop area (not bench): sell.
    if (pointer.y >= SHOP_Y) this.run.sellBench();
  }

  private shake(target: Phaser.GameObjects.GameObject & { x: number }): void {
    this.scene.tweens.add({
      targets: target,
      x: target.x + 4,
      duration: 40,
      yoyo: true,
      repeat: 3,
    });
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.startBtn.setFillStyle(locked ? COLORS.gridLine : COLORS.accent);
    this.sync();
  }

  showSellHint(visible: boolean): void {
    this.sellHint.setVisible(visible);
    this.rowBg.setStrokeStyle(1, visible ? COLORS.gold : COLORS.gridLine);
  }

  private paint(
    card: Card,
    defId: string | undefined,
    costText: string,
    affordable: boolean,
  ): void {
    card.root.setData("defId", defId);
    if (!defId) {
      card.root.setVisible(false);
      return;
    }
    const def = itemDef(defId);
    card.root.setVisible(true).setAlpha(affordable && !this.locked ? 1 : 0.45);
    card.body.setFillStyle(ITEM_CLASS_COLORS[def.itemClass] ?? 0xffffff);
    const name = itemText(CONTENT, defId).name;
    card.name.setText(name);
    card.name.setFontSize(Math.max(...name.split(" ").map((p) => p.length)) > 8 ? "8px" : "10px");
    card.cost.setText(costText);
  }

  sync(): void {
    this.run.offers.forEach((offer, i) => {
      this.paint(
        this.offers[i]!,
        offer?.defId,
        offer ? `${offer.cost}g` : "",
        !!offer && offer.cost <= this.run.gold,
      );
    });
    const b = this.run.bench;
    this.paint(this.bench, b?.defId, b && b.tier > 1 ? "★".repeat(b.tier - 1) : "", true);
    this.benchBg.setStrokeStyle(1, b ? COLORS.gold : COLORS.gridLine);
    const canReroll = !this.locked && this.run.rerollCost <= this.run.gold;
    this.rerollText
      .setText(`${ui(CONTENT, "reroll")}\n${this.run.rerollCost}g`)
      .setAlpha(canReroll ? 1 : 0.45);
    this.startText.setText(this.locked ? "…" : ui(CONTENT, "startWave").toUpperCase());
  }
}
