import type { Browser } from "playwright";
import { L, check, drag, openGame, runState } from "./harness.ts";

/** A run saved between waves survives a reload; an explicit seed starts fresh. */
export async function resume(browser: Browser): Promise<void> {
  const page = await openGame(browser, "seed=41");
  await drag(page, L.slot(0), L.cell(1, 0));
  await page.mouse.click(L.start.x, L.start.y);
  await page.mouse.click(L.speed.x, L.speed.y);
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __bb: { registry: { get(k: string): { phase: string } } } }
      ).__bb.registry.get("run").phase !== "wave",
    undefined,
    { timeout: 40_000 },
  );
  const before = await runState(page);
  check(before.waveNumber === 2, "one wave played");

  // Reload the same origin without a seed: must resume.
  await page.goto(page.url().replace(/&seed=\d+/, ""), { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      !!(
        window as unknown as { __bb?: { registry: { get(k: string): unknown } } }
      ).__bb?.registry.get("run"),
  );
  await page.waitForTimeout(200);
  const after = await runState(page);
  check(
    after.waveNumber === 2 &&
      after.gold === before.gold &&
      after.items.length === before.items.length,
    "resumed the saved run",
  );

  // A different explicit seed starts a fresh run.
  await page.goto(page.url().replace("?e2e=1", "?e2e=1&seed=8"), { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      !!(
        window as unknown as { __bb?: { registry: { get(k: string): unknown } } }
      ).__bb?.registry.get("run"),
  );
  await page.waitForTimeout(200);
  const fresh = await runState(page);
  check(fresh.waveNumber === 1 && fresh.items.length === 0, "explicit seed starts fresh");
  await page.context().close();
}
