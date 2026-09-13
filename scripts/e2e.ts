/** Runs every exported function from tests/e2e/*.e2e.ts against dist/. */
import { readdirSync } from "node:fs";
import { launch, startPreview } from "../tests/e2e/harness.ts";

const server = await startPreview();
const browser = await launch();
let failed = 0;
try {
  const files = readdirSync("tests/e2e")
    .filter((f) => f.endsWith(".e2e.ts"))
    .sort();
  for (const f of files) {
    const mod = (await import(`../tests/e2e/${f}`)) as Record<
      string,
      (b: typeof browser) => Promise<void>
    >;
    for (const [name, fn] of Object.entries(mod)) {
      const t0 = Date.now();
      try {
        await fn(browser);
        console.log(`  ✓ ${f} › ${name} (${Date.now() - t0} ms)`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${f} › ${name}\n    ${(e as Error).message}`);
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed === 0 ? "e2e: all passed" : `e2e: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
