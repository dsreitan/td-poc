/**
 * Minimal end-to-end harness: serves dist/ with `vp preview`, drives the
 * production build in headless Chromium, reads state through the `?e2e=1`
 * hook. No test framework: each check throws on failure.
 *
 *   vp build && vp run e2e
 *   E2E_CHROMIUM=/path/to/chromium vp run e2e     # custom browser binary
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";

export const PORT = 4173;
export const BASE = "/td-poc/";
export const URL = `http://localhost:${PORT}${BASE}`;

export async function startPreview(): Promise<ChildProcess> {
  const child = spawn(
    "./node_modules/.bin/vp",
    ["preview", "--port", String(PORT), "--strictPort"],
    {
      env: { ...process.env, VITE_BASE: BASE },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error("preview server did not start");
}

export async function launch(): Promise<Browser> {
  const executablePath = process.env["E2E_CHROMIUM"];
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
}

export async function openGame(browser: Browser, query: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto(`${URL}?e2e=1${query ? `&${query}` : ""}`, { waitUntil: "load" });
  await page.waitForSelector("#game canvas");
  await page.waitForFunction(() => {
    const g = (window as unknown as { __bb?: { registry: { get(k: string): unknown } } }).__bb;
    return !!g?.registry.get("run");
  });
  await page.waitForTimeout(300);
  return page;
}

export function pageErrors(page: Page): string[] {
  return (page as unknown as { __errors: string[] }).__errors;
}

/** Read a JSON-safe view of the run. */
export async function runState(page: Page): Promise<{
  phase: string;
  gold: number;
  baseHp: number;
  waveNumber: number;
  items: {
    id: string;
    defId: string;
    col: number;
    row: number;
    orientation: number;
    tier: number;
  }[];
  offers: ({ defId: string; cost: number } | null)[];
  bench: { defId: string } | null;
}> {
  return page.evaluate(() => {
    type Item = {
      id: string;
      defId: string;
      anchor: { col: number; row: number };
      orientation: number;
      tier: number;
    };
    const g = (window as unknown as { __bb: { registry: { get(k: string): unknown } } }).__bb;
    const run = g.registry.get("run") as {
      phase: string;
      gold: number;
      baseHp: number;
      waveNumber: number;
      backpack: { all(): Item[] };
      offers: ({ defId: string; cost: number } | null)[];
      bench: { defId: string } | null;
    };
    return {
      phase: run.phase,
      gold: run.gold,
      baseHp: run.baseHp,
      waveNumber: run.waveNumber,
      items: run.backpack.all().map((i) => ({
        id: i.id,
        defId: i.defId,
        col: i.anchor.col,
        row: i.anchor.row,
        orientation: i.orientation,
        tier: i.tier,
      })),
      offers: [...run.offers],
      bench: run.bench,
    };
  });
}

// Layout mirror (src/render/layout.ts). Kept in one place so a layout change fails loudly here.
export const L = (() => {
  const CELL = 68;
  const GRID_X = (360 - CELL * 4) / 2;
  const GRID_Y = 328;
  const SHOP_Y = GRID_Y + CELL * 5 + 6;
  const SHOP_A_Y = SHOP_Y;
  const SHOP_A_H = 60;
  const SHOP_B_Y = SHOP_A_Y + SHOP_A_H + 4;
  const SHOP_B_H = 800 - SHOP_B_Y - 6;
  const SLOT = 64;
  const SHOP_X = 4;
  const BENCH_W = SLOT - 4;
  const START_X = SHOP_X + BENCH_W + 6;
  const START_W = 360 - START_X - 4;
  return {
    CELL,
    cardW: SLOT - 4,
    cardH: SHOP_A_H - 6,
    slot: (i: number) => ({
      x: SHOP_X + i * SLOT + (SLOT - 4) / 2,
      y: SHOP_A_Y + 3 + (SHOP_A_H - 6) / 2,
    }),
    cell: (c: number, r: number) => ({
      x: GRID_X + c * CELL + CELL / 2,
      y: GRID_Y + r * CELL + CELL / 2,
    }),
    bench: { x: SHOP_X + BENCH_W / 2, y: SHOP_B_Y + 3 + (SHOP_B_H - 6) / 2 },
    start: { x: START_X + START_W / 2, y: SHOP_B_Y + SHOP_B_H / 2 },
    speed: { x: 360 - 20, y: 14 },
  };
})();

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

export function check(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`E2E FAIL: ${msg}`);
}
