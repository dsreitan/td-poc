/**
 * Architectural rule: src/sim is pure TypeScript. No Phaser, no renderer,
 * no unseeded randomness, no DOM. Oxlint enforces the same in
 * vite.config.ts; this test is the backstop that survives config drift.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const SIM_DIR = join(import.meta.dirname, "..", "src", "sim");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bphaser\b/i, why: "Phaser import or reference" },
  { pattern: /from\s+["'][^"']*\/render\//, why: "import from src/render" },
  { pattern: /Math\.random\s*\(/, why: "unseeded randomness" },
  { pattern: /\bwindow\./, why: "DOM access" },
  { pattern: /\bdocument\./, why: "DOM access" },
  { pattern: /\bperformance\.now\s*\(/, why: "wall-clock time" },
  { pattern: /\bDate\.now\s*\(/, why: "wall-clock time" },
];

describe("src/sim boundary", () => {
  const files = walk(SIM_DIR);

  it("has simulation files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.slice(SIM_DIR.length + 1)} is pure`, () => {
      const src = readFileSync(file, "utf8");
      for (const { pattern, why } of FORBIDDEN) {
        const m = pattern.exec(src);
        expect(m, `${why} (${pattern}) found: ${m?.[0] ?? ""}`).toBeNull();
      }
    });
  }
});
