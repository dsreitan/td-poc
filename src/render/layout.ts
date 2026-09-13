/** Virtual resolution and panel layout. docs/PLAN.md §2.1. */
export const VIEW_W = 360;
export const VIEW_H = 800;

/** Battlefield: top 40%. */
export const BATTLE_Y = 0;
export const BATTLE_H = 320;

/** Backpack + shop: bottom 60%. */
export const PANEL_Y = BATTLE_H;
export const PANEL_H = VIEW_H - BATTLE_H;

export const LANES = 4;
export const LANE_W = VIEW_W / LANES;

/** Backpack grid cell size and origin; columns align with lanes. */
export const CELL = 72;
export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const GRID_X = (VIEW_W - CELL * GRID_COLS) / 2;
export const GRID_Y = PANEL_Y + 24;

export const COLORS = {
  bg: 0x14161c,
  battle: 0x1b1f2a,
  panel: 0x20242f,
  laneLine: 0x2c3140,
  gridLine: 0x3a4052,
  gridCell: 0x262b38,
  accent: 0x3a86ff,
  text: "#e6e8ef",
  muted: "#8b93a7",
} as const;
