import Phaser from "phaser";
import { CONTENT, enemyText, ui } from "../../content/index.ts";
import { enemyDef } from "../../sim/combat/enemies.ts";
import type { WavePreview } from "../../sim/combat/waves.ts";
import {
  COLORS,
  ENEMY_COLORS,
  LANES,
  LANE_W,
  PREVIEW_H,
  PREVIEW_Y,
  laneCenterX,
} from "../layout.ts";

/**
 * Next-wave preview drawn in the battlefield during the shop phase: per
 * lane, one chip per enemy type with its count, bosses marked, and the
 * lanes a boss may move into outlined. docs/PLAN.md §2.9.
 */
export class PreviewView {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(2);
  }

  show(preview: WavePreview | undefined): void {
    this.root.removeAll(true);
    if (!preview) return;
    const s = this.scene;
    const font = { fontFamily: "monospace", fontSize: "11px", color: COLORS.muted };
    this.root.add(
      s.add.text(
        8,
        PREVIEW_Y,
        `${ui(CONTENT, "nextWave").toUpperCase()} ${preview.wave} · ${preview.total} ${ui(CONTENT, "enemies")}`,
        {
          ...font,
          color: COLORS.text,
        },
      ),
    );
    for (let lane = 0; lane < LANES; lane++) {
      const lp = preview.lanes[lane]!;
      const cx = laneCenterX(lane);
      let y = PREVIEW_Y + 22;
      const entries = Object.entries(lp.counts).sort((a, b) => a[0].localeCompare(b[0]));
      if (entries.length === 0 && lp.bossVisits.length === 0) {
        this.root.add(s.add.text(cx, y + 8, "—", { ...font }).setOrigin(0.5, 0));
        continue;
      }
      for (const [type, count] of entries) {
        const def = enemyDef(type);
        const size = def.isBoss ? 26 : 16;
        const chip = s.add.rectangle(
          cx - 18,
          y + size / 2,
          size,
          size,
          ENEMY_COLORS[type] ?? 0xffffff,
        );
        if (def.isBoss) chip.setStrokeStyle(2, COLORS.gold);
        const label = s.add
          .text(cx - 4, y + size / 2, def.isBoss ? enemyText(CONTENT, type).name : `×${count}`, {
            ...font,
            color: COLORS.text,
            fontSize: def.isBoss ? "10px" : "12px",
          })
          .setOrigin(0, 0.5);
        this.root.add([chip, label]);
        y += size + 6;
        if (y > PREVIEW_Y + PREVIEW_H - 20) break;
      }
      for (const boss of lp.bossVisits) {
        const chip = s.add.rectangle(cx - 18, y + 13, 26, 26).setStrokeStyle(2, COLORS.gold);
        const label = s.add
          .text(cx - 4, y + 13, `${enemyText(CONTENT, boss).name}?`, { ...font, fontSize: "10px" })
          .setOrigin(0, 0.5);
        this.root.add([chip, label]);
        y += 32;
      }
      // Lane pressure bar at the bottom of the preview area.
      const max = Math.max(1, ...preview.lanes.map((l) => l.total));
      const w = Math.max(4, (lp.total / max) * (LANE_W - 20));
      this.root.add(
        s.add
          .rectangle(cx - w / 2, PREVIEW_Y + PREVIEW_H - 6, w, 4, COLORS.bad, 0.8)
          .setOrigin(0, 0.5),
      );
    }
  }

  hide(): void {
    this.root.removeAll(true);
  }
}
