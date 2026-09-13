import Phaser from "phaser";
import type { Tier } from "../../sim/items/types.ts";
import { describeItem } from "../describe.ts";
import { COLORS, HUD_H, VIEW_W, BATTLE_H } from "../layout.ts";

/** Item details, drawn over the battlefield during the shop. Tap to dismiss. */
export class InfoView {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private current: string | undefined;
  private readonly onClose: () => void;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.root = scene.add.container(0, 0).setDepth(15).setVisible(false);
  }

  get shownDefId(): string | undefined {
    return this.current;
  }

  show(defId: string, tier: Tier): void {
    this.root.removeAll(true);
    const info = describeItem(defId, tier);
    const s = this.scene;
    const x = 10;
    const w = VIEW_W - 20;
    const top = HUD_H + 6;
    const h = BATTLE_H - top - 8;
    const bg = s.add
      .rectangle(x, top, w, h, COLORS.bg, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.accent)
      .setInteractive();
    bg.on("pointerup", () => this.hide());
    const font: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "monospace",
      fontSize: "11px",
      color: COLORS.text,
      wordWrap: { width: w - 24 },
    };
    let y = top + 10;
    const add = (t: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}) => {
      const txt = s.add.text(x + 12, y, t, { ...font, ...style });
      this.root.add(txt);
      y += txt.height + 4;
    };
    this.root.add(bg);
    add(info.title, { fontSize: "16px" });
    add(info.subtitle, { color: COLORS.muted });
    y += 4;
    for (const l of info.lines) add(`• ${l}`);
    if (info.recipes.length) {
      y += 4;
      for (const r of info.recipes) add(r, { color: "#ffc857" });
    }
    if (info.description) {
      y += 6;
      add(info.description, { color: COLORS.muted });
    }
    this.current = defId;
    this.root.setVisible(true);
  }

  hide(): void {
    if (!this.current) return;
    this.current = undefined;
    this.root.setVisible(false);
    this.root.removeAll(true);
    this.onClose();
  }
}
