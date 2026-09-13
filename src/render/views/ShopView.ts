import Phaser from "phaser";
import { CONTENT, itemText, ui } from "../../content/index.ts";
import type { Run } from "../../sim/Run.ts";
import type { Orientation } from "../../sim/grid/shapes.ts";
import { itemDef } from "../../sim/items/defs.ts";
import {
  COLORS,
  ITEM_CLASS_COLORS,
  SHOP_H,
  SHOP_SLOT,
  SHOP_X,
  SHOP_Y,
  START_BTN_W,
  START_BTN_X,
} from "../layout.ts";
import type { BackpackView } from "./BackpackView.ts";

interface Slot {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
}

/** Four offers, a start button, and the sell zone hint. */
export class ShopView {
  private readonly scene: Phaser.Scene;
  private readonly run: Run;
  private readonly slots: Slot[] = [];
  private readonly sellHint: Phaser.GameObjects.Text;
  private readonly startBtn: Phaser.GameObjects.Rectangle;
  private readonly startText: Phaser.GameObjects.Text;
  private readonly rowBg: Phaser.GameObjects.Rectangle;
  private locked = false;
  private readonly backpackView: BackpackView;
  private readonly onChanged: () => void;

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
    this.rowBg = scene.add
      .rectangle(0, SHOP_Y, 360, SHOP_H, COLORS.panel)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLORS.gridLine);
    this.sellHint = scene.add
      .text(SHOP_X + SHOP_SLOT * 2, SHOP_Y + SHOP_H / 2, `${ui(CONTENT, "sell")} ↓`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(3);

    for (let i = 0; i < 4; i++) this.slots.push(this.createSlot(i));

    this.startBtn = scene.add
      .rectangle(START_BTN_X, SHOP_Y + 4, START_BTN_W, SHOP_H - 8, COLORS.accent)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.startText = scene.add
      .text(
        START_BTN_X + START_BTN_W / 2,
        SHOP_Y + SHOP_H / 2,
        ui(CONTENT, "startWave").toUpperCase(),
        {
          fontFamily: "monospace",
          fontSize: "12px",
          color: COLORS.text,
          align: "center",
          wordWrap: { width: START_BTN_W - 6 },
        },
      )
      .setOrigin(0.5);
    this.startBtn.on("pointerup", () => {
      if (!this.locked) onStart();
    });
    this.sync();
  }

  private createSlot(i: number): Slot {
    const x = SHOP_X + i * SHOP_SLOT;
    const body = this.scene.add
      .rectangle(0, 0, SHOP_SLOT - 6, SHOP_H - 8, 0x000000)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x000000, 0.3);
    const name = this.scene.add
      .text((SHOP_SLOT - 6) / 2, 16, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: COLORS.textDark,
        align: "center",
        wordWrap: { width: SHOP_SLOT - 10 },
      })
      .setOrigin(0.5, 0);
    const cost = this.scene.add
      .text((SHOP_SLOT - 6) / 2, SHOP_H - 20, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: COLORS.textDark,
      })
      .setOrigin(0.5, 0.5);
    const root = this.scene.add.container(x, SHOP_Y + 4, [body, name, cost]).setDepth(3);
    root.setSize(SHOP_SLOT - 6, SHOP_H - 8);
    root.setInteractive({ draggable: true, useHandCursor: true });

    let orientation: Orientation = 0;
    let dragging = false;
    root.on("dragstart", () => {
      if (this.locked || !this.run.offers[i]) return;
      dragging = true;
      orientation = 0;
      root.setDepth(10);
    });
    root.on("drag", (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (!dragging) return;
      root.setPosition(dragX, dragY);
      const offer = this.run.offers[i];
      if (offer) this.backpackView.externalPreview(pointer, offer.defId, orientation);
    });
    root.on("dragend", (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      dragging = false;
      root.setDepth(3);
      const anchor = this.backpackView.externalDrop(pointer);
      if (anchor) {
        const res = this.run.buy(i, anchor, orientation);
        if (!res.ok) this.shake(root);
      }
      root.setPosition(x, SHOP_Y + 4);
      this.sync();
      this.onChanged();
    });
    return { root, body, name, cost };
  }

  private shake(target: Phaser.GameObjects.Container): void {
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
    this.startText.setText(locked ? "…" : ui(CONTENT, "startWave").toUpperCase());
    this.sync();
  }

  showSellHint(visible: boolean): void {
    this.sellHint.setVisible(visible);
    this.rowBg.setStrokeStyle(1, visible ? COLORS.gold : COLORS.gridLine);
  }

  sync(): void {
    this.run.offers.forEach((offer, i) => {
      const s = this.slots[i]!;
      if (!offer) {
        s.root.setVisible(false);
        return;
      }
      const def = itemDef(offer.defId);
      const text = itemText(CONTENT, offer.defId);
      const affordable = offer.cost <= this.run.gold && !this.locked;
      s.root.setVisible(true).setAlpha(affordable ? 1 : 0.45);
      s.body.setFillStyle(ITEM_CLASS_COLORS[def.itemClass] ?? 0xffffff);
      s.name.setText(text.name);
      s.cost.setText(`${offer.cost}g`);
    });
  }
}
