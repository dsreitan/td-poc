import type { Browser } from "playwright";
import { L, check, drag, openGame, pageErrors, runState } from "./harness.ts";

/**
 * Regression: Phaser Containers hit-test around their centre. Cards and grid
 * items must be grabbable anywhere on their drawn area, not just one corner.
 * Seed 41's first shop is [crossbow, crossbow, frost_flask, spiked_shield].
 */
export async function shopDrag(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=41");
  const s0 = await runState(page);
  check(s0.phase === "shop" && s0.items.length === 0, "fresh run starts in an empty shop");
  check(s0.offers.filter(Boolean).length === 4, "four offers");

  // 1) Drag from the exact centre of offer 0.
  await drag(page, L.slot(0), L.cell(1, 0));
  let s = await runState(page);
  check(
    s.items.length === 1 && s.items[0]!.col === 1 && s.items[0]!.row === 0,
    "centre grab places offer 0 at (1,0)",
  );
  check(s.offers[0] === null, "offer 0 consumed");
  check(s.gold === s0.gold - s0.offers[0]!.cost, "gold charged");

  // 2) Drag from the bottom-right quadrant of offer 1 (the bug: only the top-left quarter used to work).
  const c1 = L.slot(1);
  await drag(page, { x: c1.x + L.cardW * 0.35, y: c1.y + L.cardH * 0.35 }, L.cell(2, 0));
  s = await runState(page);
  check(s.items.length === 2, "off-centre grab places offer 1");
  check(
    s.items.some((i) => i.col === 2 && i.row === 0),
    "placed at (2,0)",
  );

  // 3) Drag from the top-left quadrant of offer 2 onto the bench.
  const c2 = L.slot(2);
  await drag(page, { x: c2.x - L.cardW * 0.35, y: c2.y - L.cardH * 0.35 }, L.bench);
  s = await runState(page);
  check(s.bench?.defId === "frost_flask", "offer 2 went to the bench");

  // 4) Move a grid item by grabbing its bottom-right quadrant.
  const g = L.cell(1, 0);
  await drag(page, { x: g.x + L.CELL * 0.3, y: g.y + L.CELL * 0.3 }, L.cell(0, 2));
  s = await runState(page);
  check(
    s.items.some((i) => i.col === 0 && i.row === 2),
    "grid item moved to (0,2) from an off-centre grab",
  );

  // 5) Tap rotates (touch input path).
  const before = s.items.find((i) => i.col === 0 && i.row === 2)!;
  await page.touchscreen.tap(L.cell(0, 2).x, L.cell(0, 2).y);
  await page.waitForTimeout(150);
  s = await runState(page);
  const after = s.items.find((i) => i.id === before.id)!;
  check(after.orientation === (before.orientation + 1) % 4, "tap rotates a grid item");

  // 6) Bench back to grid.
  await drag(page, L.bench, L.cell(3, 4));
  s = await runState(page);
  check(
    s.bench === null && s.items.some((i) => i.col === 3 && i.row === 4),
    "bench item placed at (3,4)",
  );

  // 7) Start the wave at 2x and come back to the shop.
  await page.mouse.click(L.start.x, L.start.y);
  await page.mouse.click(L.speed.x, L.speed.y);
  s = await runState(page);
  check(s.phase === "wave", "wave started");
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __bb: { registry: { get(k: string): { phase: string } } } })
        .__bb;
      return g.registry.get("run").phase !== "wave";
    },
    undefined,
    { timeout: 40_000 },
  );
  s = await runState(page);
  check(s.phase === "shop" && s.waveNumber === 2, "back in the shop for wave 2");

  const errs = pageErrors(page);
  check(errs.length === 0, `no page errors, got: ${errs.join(" | ")}`);
  await page.context().close();
}
