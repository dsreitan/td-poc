import Phaser from "phaser";
import { CONTENT, ui } from "../../content/index.ts";
import type { Run } from "../../sim/Run.ts";
import { COLORS, HUD_H, VIEW_W } from "../layout.ts";

/** Gold, wave, base HP, speed toggle. */
export class HudView {
  private readonly text: Phaser.GameObjects.Text;
  private readonly speedBtn: Phaser.GameObjects.Text;
  speed = 1;
  private readonly run: Run;

  constructor(scene: Phaser.Scene, run: Run, onNewRun: () => void) {
    this.run = run;
    // Abandon the run: first tap asks, second tap within 2 s confirms.
    const newBtn = scene.add
      .text(VIEW_W - 52, HUD_H / 2, ui(CONTENT, "newRun"), {
        fontFamily: "monospace",
        fontSize: "11px",
        color: COLORS.muted,
        backgroundColor: "#2c3140",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    let armed = false;
    newBtn.on("pointerup", () => {
      if (armed) {
        onNewRun();
        return;
      }
      armed = true;
      newBtn.setText(ui(CONTENT, "confirm")).setColor("#ffc857");
      scene.time.delayedCall(2000, () => {
        armed = false;
        if (newBtn.active) newBtn.setText(ui(CONTENT, "newRun")).setColor(COLORS.muted);
      });
    });
    scene.add.rectangle(0, 0, VIEW_W, HUD_H, COLORS.bg).setOrigin(0, 0);
    this.text = scene.add
      .text(8, HUD_H / 2, "", { fontFamily: "monospace", fontSize: "13px", color: COLORS.text })
      .setOrigin(0, 0.5);
    this.speedBtn = scene.add
      .text(VIEW_W - 8, HUD_H / 2, "1×", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLORS.text,
        backgroundColor: "#2c3140",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    this.speedBtn.on("pointerup", () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.speedBtn.setText(`${this.speed}×`);
    });
    this.sync();
  }

  sync(): void {
    const r = this.run;
    this.text.setText(
      `${ui(CONTENT, "gold")} ${r.gold}  ·  ${ui(CONTENT, "wave")} ${r.waveNumber}/${r.waveCount}  ·  ${ui(CONTENT, "base")} ${r.baseHp}`,
    );
  }
}
