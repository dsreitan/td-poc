/**
 * Balance harness.
 *
 *   node scripts/bench.ts            # autopilot over 50 seeds + static builds with carried HP
 *   node scripts/bench.ts 200        # more seeds
 *
 * Node 22.18+/24 executes TypeScript directly (type stripping).
 */
import { Run } from "../src/sim/Run.ts";
import { autopilot } from "../src/sim/autopilot.ts";
import { Backpack } from "../src/sim/grid/Backpack.ts";
import type { ItemSpec } from "../src/sim/grid/Backpack.ts";
import type { Cell, Orientation } from "../src/sim/grid/shapes.ts";
import { itemDef } from "../src/sim/items/defs.ts";
import { Rng } from "../src/sim/rng.ts";
import { DEFAULT_MODIFIERS } from "../src/sim/modifiers.ts";
import { WAVES } from "../src/sim/combat/waves.ts";
import { runWave } from "../src/sim/combat/runWave.ts";

type Placement = [defId: string, anchor: Cell, orientation?: Orientation, tier?: 1 | 2 | 3];

function build(placements: Placement[]): Backpack {
  const bp = new Backpack();
  placements.forEach(([defId, anchor, orientation = 0, tier = 1], i) => {
    const spec: ItemSpec = { id: `${defId}#${i + 1}`, defId, tier, shape: itemDef(defId).shape };
    const r = bp.place(spec, anchor, orientation);
    if (!r.ok) throw new Error(`bench build: cannot place ${spec.id}: ${r.reason}`);
  });
  return bp;
}

const STATIC: Record<string, Placement[]> = {
  "empty (should die ~wave 4)": [],
  "4 crossbows, front row (naive)": [
    ["crossbow", { col: 0, row: 0 }],
    ["crossbow", { col: 1, row: 0 }],
    ["crossbow", { col: 2, row: 0 }],
    ["crossbow", { col: 3, row: 0 }],
  ],
  "full t2 build (thoughtful)": [
    ["ballista", { col: 0, row: 0 }, 0, 2],
    ["cannon", { col: 1, row: 0 }, 1, 2],
    ["ballista", { col: 3, row: 0 }, 0, 2],
    ["crossbow", { col: 1, row: 1 }, 0, 2],
    ["crossbow", { col: 2, row: 1 }, 0, 2],
    ["gearbox", { col: 1, row: 2 }, 0, 2],
    ["gearbox", { col: 2, row: 2 }, 0, 2],
    ["ammo_pouch", { col: 0, row: 2 }, 0, 2],
    ["frost_flask", { col: 3, row: 2 }, 0, 2],
    ["spiked_shield", { col: 0, row: 3 }, 0, 1],
    ["spiked_shield", { col: 3, row: 3 }, 0, 1],
  ],
};

const seeds = Number(process.argv[2] ?? 50);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log(`Backpack Bastion bench · waves 1-${WAVES.length}\n`);
console.log("== static builds, base HP carried across waves (no shopping)");
for (const [name, placements] of Object.entries(STATIC)) {
  let hp = DEFAULT_MODIFIERS.baseHp;
  let reached = 0;
  const trail: string[] = [];
  for (const wave of WAVES) {
    const r = runWave({
      backpack: build(placements),
      wave,
      rng: new Rng(1),
      modifiers: DEFAULT_MODIFIERS,
      baseHp: hp,
    });
    hp = r.baseHp;
    trail.push(String(hp));
    reached = wave.id;
    if (r.result === "baseDestroyed") break;
  }
  console.log(
    `  ${pad(name, 36)} ${hp > 0 ? "WON " : "died"} wave ${reached}  hp trail: ${trail.join(" ")}`,
  );
}

console.log(`\n== autopilot (greedy buyer) over ${seeds} seeds`);
const reached: number[] = Array.from({ length: WAVES.length + 1 }, () => 0);
let wins = 0;
let hpSum = 0;
const bought: Record<string, number> = {};
for (let seed = 1; seed <= seeds; seed++) {
  const res = autopilot(new Run({ seed }));
  if (res.phase === "won") wins++;
  reached[res.waveReached]!++;
  hpSum += res.baseHp;
  for (const [k, v] of Object.entries(res.bought)) bought[k] = (bought[k] ?? 0) + v;
}
console.log(
  `  win rate ${Math.round((wins / seeds) * 100)}% · avg end HP ${(hpSum / seeds).toFixed(1)}`,
);
console.log(`  ${pad("ended at wave", 16)}${WAVES.map((w) => pad(w.id, 4)).join("")}`);
console.log(`  ${pad("runs", 16)}${WAVES.map((w) => pad(reached[w.id]!, 4)).join("")}`);
const totalBought = Object.values(bought).reduce((a, b) => a + b, 0);
console.log(
  `  bought (${totalBought}): ${Object.entries(bought)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")}`,
);
const never = itemDefsNeverBought(bought);
if (never.length) console.log(`  never bought: ${never.join(", ")}`);

function itemDefsNeverBought(b: Record<string, number>): string[] {
  return Object.keys(b).length === 0
    ? []
    : [
        "crossbow",
        "cannon",
        "flame_lance",
        "ballista",
        "frost_flask",
        "gearbox",
        "ammo_pouch",
        "fire_rune",
        "lodestone",
        "spiked_shield",
        "iron_wall",
        "coin_purse",
      ].filter((id) => !b[id]);
}
