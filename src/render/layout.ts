/** Virtual resolution and panel layout. docs/PLAN.md §2.1. */
export const VIEW_W = 360;
export const VIEW_H = 800;

/** HUD strip at the very top. */
export const HUD_H = 28;

/** Battlefield: top 40% (includes the HUD strip). */
export const BATTLE_Y = 0;
export const BATTLE_H = 320;
/** Enemies travel from SPAWN_Y (pos 1000) to BASE_Y (pos 0). */
export const SPAWN_Y = HUD_H + 10;
export const BASE_Y = BATTLE_H - 6;

/** Backpack + shop: bottom 60%. */
export const PANEL_Y = BATTLE_H;
export const PANEL_H = VIEW_H - BATTLE_H;

export const LANES = 4;
export const LANE_W = VIEW_W / LANES;

/** Backpack grid; columns align with lanes. */
export const CELL = 68;
export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const GRID_X = (VIEW_W - CELL * GRID_COLS) / 2;
export const GRID_Y = PANEL_Y + 8;
export const GRID_H = CELL * GRID_ROWS;

/** Shop, two rows under the grid. Row A: offers + reroll. Row B: bench + start. */
export const SHOP_Y = GRID_Y + GRID_H + 6;
export const SHOP_A_Y = SHOP_Y;
export const SHOP_A_H = 60;
export const SHOP_B_Y = SHOP_A_Y + SHOP_A_H + 4;
export const SHOP_B_H = VIEW_H - SHOP_B_Y - 6;
export const SHOP_H = VIEW_H - SHOP_Y - 6;
export const SHOP_SLOT = 64;
export const SHOP_X = 4;
export const REROLL_X = SHOP_X + SHOP_SLOT * 4 + 6;
export const REROLL_W = VIEW_W - REROLL_X - 4;
export const BENCH_X = SHOP_X;
export const BENCH_W = SHOP_SLOT - 4;
export const START_BTN_X = BENCH_X + BENCH_W + 6;
export const START_BTN_W = VIEW_W - START_BTN_X - 4;

/** Battlefield sub-areas used during the shop phase. */
export const PREVIEW_Y = HUD_H + 6;
export const PREVIEW_H = 160;
export const METER_Y = PREVIEW_Y + PREVIEW_H + 6;
export const METER_H = BATTLE_H - METER_Y - 8;

export const COLORS = {
  bg: 0x14161c,
  battle: 0x1b1f2a,
  panel: 0x20242f,
  laneLine: 0x2c3140,
  laneHint: 0x3a86ff,
  gridLine: 0x3a4052,
  gridCell: 0x262b38,
  accent: 0x3a86ff,
  ok: 0x3ddc84,
  bad: 0xff5d5d,
  gold: 0xffc857,
  hp: 0x3ddc84,
  hpBack: 0x3a2020,
  text: "#e6e8ef",
  muted: "#8b93a7",
  textDark: "#14161c",
} as const;

/** Placeholder colours per item class and per enemy type. */
export const ITEM_CLASS_COLORS: Record<string, number> = {
  projectileWeapon: 0x4f7cff,
  magicWeapon: 0xb36bff,
  support: 0x3ddc84,
  defensive: 0x9aa5b8,
  economy: 0xffc857,
};

export const ENEMY_COLORS: Record<string, number> = {
  grunt: 0xd9534f,
  runner: 0xff9f43,
  armored: 0x8d99ae,
  swarmling: 0xf78fb3,
  warden: 0xc0392b,
  bulwark: 0x7b241c,
};

export function cellToXY(col: number, row: number): { x: number; y: number } {
  return { x: GRID_X + col * CELL, y: GRID_Y + row * CELL };
}

export function xyToCell(x: number, y: number): { col: number; row: number } | undefined {
  const col = Math.floor((x - GRID_X) / CELL);
  const row = Math.floor((y - GRID_Y) / CELL);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return undefined;
  return { col, row };
}

export function laneCenterX(lane: number): number {
  return lane * LANE_W + LANE_W / 2;
}

/** Lane position 0..1000 to screen y. */
export function posToY(pos: number): number {
  return BASE_Y - (pos / 1000) * (BASE_Y - SPAWN_Y);
}

export function inBench(x: number, y: number): boolean {
  return x >= BENCH_X && x <= BENCH_X + BENCH_W && y >= SHOP_B_Y && y <= SHOP_B_Y + SHOP_B_H;
}

/** Anywhere in the shop area except the bench slot sells the dragged item. */
export function inSellZone(x: number, y: number): boolean {
  return y >= SHOP_Y && y <= SHOP_Y + SHOP_H && !inBench(x, y);
}
