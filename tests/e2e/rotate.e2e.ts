import type { Browser } from "playwright";
import { L, check, openGame, runState } from "./harness.ts";

/**
 * Rotating while dragging. Seed 4's first offer is a cannon (1x2), which is
 * vertical by default; rotated once it lies across two lanes.
 */
export async function rotateWhileDraggingKeyboard(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=4");
  const from = L.slot(0);
  const to = L.cell(0, 1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.keyboard.press("r");
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const s = await runState(page);
  const cannon = s.items.find((i) => i.defId === "cannon");
  check(!!cannon, "cannon placed");
  check(
    cannon!.orientation === 1,
    `R while dragging rotates the card, got orientation ${cannon!.orientation}`,
  );
  check(cannon!.col === 0 && cannon!.row === 1, "anchor at (0,1)");
  await page.context().close();
}

export async function rotateWhileDraggingSecondFinger(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=4");
  const from = L.slot(0);
  const to = L.cell(0, 1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  // A second pointer (touch) taps anywhere while the first keeps dragging.
  await page.touchscreen.tap(300, 150);
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const s = await runState(page);
  const cannon = s.items.find((i) => i.defId === "cannon");
  check(!!cannon, "cannon placed");
  check(
    cannon!.orientation === 1,
    `second pointer tap rotates the dragged card, got orientation ${cannon!.orientation}`,
  );
  await page.context().close();
}

export async function rotateGridItemWhileDragging(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=4");
  // Place the cannon vertically, then drag it and rotate with the wheel.
  const from = L.slot(0);
  let to = L.cell(3, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  let s = await runState(page);
  check(s.items[0]!.orientation === 0 && s.items[0]!.col === 3, "cannon vertical at (3,0)");
  const grab = L.cell(3, 0);
  to = L.cell(1, 2);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 8, grab.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
  s = await runState(page);
  check(
    s.items[0]!.orientation === 1,
    `wheel rotates a dragged grid item, got ${s.items[0]!.orientation}`,
  );
  check(
    s.items[0]!.col === 1 && s.items[0]!.row === 2,
    `moved to (1,2), got (${s.items[0]!.col},${s.items[0]!.row})`,
  );
  await page.context().close();
}
