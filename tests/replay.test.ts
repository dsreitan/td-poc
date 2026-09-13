/**
 * Determinism tripwire. Fixed seed + fixed build + default modifiers must
 * always produce the same event stream. When a rule change legitimately
 * alters combat, update GOLDEN deliberately in the same commit.
 */
import { describe, expect, it } from "vite-plus/test";
import { runWave } from "../src/sim/combat/runWave.ts";
import { WAVES } from "../src/sim/combat/waves.ts";
import { DEFAULT_MODIFIERS } from "../src/sim/modifiers.ts";
import { Rng } from "../src/sim/rng.ts";
import { build } from "./sim/helpers.ts";

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const REFERENCE = () =>
  build([
    ["crossbow", { col: 0, row: 0 }, 0, 1, "xb1"],
    ["cannon", { col: 1, row: 0 }, 1, 1, "cn"],
    ["crossbow", { col: 3, row: 0 }, 0, 2, "xb2"],
    ["gearbox", { col: 0, row: 1 }, 0, 1, "gb"],
    ["frost_flask", { col: 2, row: 1 }, 0, 1, "ff"],
    ["ammo_pouch", { col: 3, row: 1 }, 0, 1, "ap"],
    ["spiked_shield", { col: 1, row: 2 }, 0, 1, "sh"],
  ]);

const GOLDEN = "2cf2fa16";

describe("replay determinism", () => {
  it("two runs with the same inputs produce identical events", () => {
    const a = runWave({
      backpack: REFERENCE(),
      wave: WAVES[0]!,
      rng: new Rng(42),
      modifiers: DEFAULT_MODIFIERS,
    });
    const b = runWave({
      backpack: REFERENCE(),
      wave: WAVES[0]!,
      rng: new Rng(42),
      modifiers: DEFAULT_MODIFIERS,
    });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it("matches the committed golden hash across all waves", () => {
    const parts: string[] = [];
    for (const wave of WAVES) {
      const run = runWave({
        backpack: REFERENCE(),
        wave,
        rng: new Rng(42),
        modifiers: DEFAULT_MODIFIERS,
      });
      parts.push(JSON.stringify(run.events));
    }
    const hash = fnv1a(parts.join("|"));
    // On a deliberate rules change: run once, copy the printed value into GOLDEN.
    if (hash !== GOLDEN) console.error(`REPLAY GOLDEN = ${hash}`);
    expect(hash).toBe(GOLDEN);
  });
});
