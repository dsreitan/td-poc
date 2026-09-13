import Phaser from "phaser";
import {
  BATTLE_H,
  BATTLE_Y,
  CELL,
  COLORS,
  GRID_COLS,
  GRID_ROWS,
  GRID_X,
  GRID_Y,
  LANES,
  LANE_W,
  PANEL_H,
  PANEL_Y,
  VIEW_W,
} from "../layout.ts";

/**
 * M0 "hello" scene: the two-panel portrait split, four lanes and the 4x5
 * backpack grid, with placeholder graphics. No simulation wired yet.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    const g = this.add.graphics();

    // Battlefield panel
    g.fillStyle(COLORS.battle, 1);
    g.fillRect(0, BATTLE_Y, VIEW_W, BATTLE_H);
    g.lineStyle(1, COLORS.laneLine, 1);
    for (let i = 1; i < LANES; i++) {
      g.lineBetween(i * LANE_W, BATTLE_Y, i * LANE_W, BATTLE_Y + BATTLE_H);
    }
    // Base line
    g.lineStyle(2, COLORS.accent, 1);
    g.lineBetween(0, BATTLE_Y + BATTLE_H - 2, VIEW_W, BATTLE_Y + BATTLE_H - 2);

    // Backpack panel
    g.fillStyle(COLORS.panel, 1);
    g.fillRect(0, PANEL_Y, VIEW_W, PANEL_H);

    // Grid cells
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const x = GRID_X + col * CELL;
        const y = GRID_Y + row * CELL;
        g.fillStyle(COLORS.gridCell, 1);
        g.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        g.lineStyle(1, COLORS.gridLine, 1);
        g.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }
    }

    // Labels
    const style = { fontFamily: "monospace", fontSize: "14px", color: COLORS.muted };
    this.add.text(8, 8, "BACKPACK BASTION · M0", { ...style, color: COLORS.text });
    for (let i = 0; i < LANES; i++) {
      this.add.text(i * LANE_W + LANE_W / 2, BATTLE_Y + 40, `lane ${i}`, style).setOrigin(0.5, 0);
    }
    this.add.text(GRID_X, GRID_Y - 18, "backpack 4×5 · columns = lanes", style);
    this.add
      .text(VIEW_W / 2, GRID_Y + GRID_ROWS * CELL + 24, "shop goes here (M3)", style)
      .setOrigin(0.5, 0);
  }
}
