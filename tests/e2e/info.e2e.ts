import type { Browser } from "playwright";
import { L, check, drag, openGame, runState } from "./harness.ts";

async function infoShown(page: Awaited<ReturnType<typeof openGame>>): Promise<string | undefined> {
  return page.evaluate(() =>
    (
      window as unknown as { __bb: { registry: { get(k: string): string | undefined } } }
    ).__bb.registry.get("info"),
  );
}

/** Tap a shop card for details; hold a grid item for details; tap the panel to close. */
export async function itemInfo(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=41");
  const s0 = await runState(page);
  // Tap (touch) offer 0 without dragging.
  await page.touchscreen.tap(L.slot(0).x, L.slot(0).y);
  await page.waitForTimeout(150);
  check((await infoShown(page)) === s0.offers[0]!.defId, "tapping a shop card shows its info");
  // Tap the panel to close.
  await page.touchscreen.tap(180, 160);
  await page.waitForTimeout(150);
  check((await infoShown(page)) === undefined, "tapping the panel closes it");
  // Place an item, then hold it.
  await drag(page, L.slot(0), L.cell(1, 0));
  const placed = (await runState(page)).items[0]!;
  await page.mouse.move(L.cell(1, 0).x, L.cell(1, 0).y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(150);
  check((await infoShown(page)) === placed.defId, "holding a grid item shows its info");
  const after = (await runState(page)).items[0]!;
  check(after.orientation === placed.orientation, "a hold does not rotate");
  await page.context().close();
}

/** The second content pack renames everything without touching mechanics. */
export async function contentPack(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=41&pack=scifi");
  const title = await page.title();
  check(title === "Hull Breach", `document title follows the pack, got ${title}`);
  const s = await runState(page);
  check(s.offers[0]!.defId === "crossbow", "mechanics ids unchanged under a reskin");
  await page.context().close();
}
