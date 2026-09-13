/**
 * Balance harness. Runs reference builds through the wave list and prints
 * clear rates, base HP, ticks and top damage sources.
 *
 *   node scripts/bench.ts            # all builds, all waves
 *   node scripts/bench.ts 25         # 25 seeds per build
 *
 * Node 22.18+/24 executes TypeScript directly (type stripping).
 */
import { Backpack } from "../src/sim/grid/Backpack.ts";
import type { ItemSpec } from "../src/sim/grid/Backpack.ts";
import type { Cell, Orientation } from "../src/sim/grid/shapes.ts";
import { itemDef } from "../src/sim/items/defs.ts";
import { Rng } from "../src/sim/rng.ts";
import { DEFAULT_MODIFIERS } from "../src/sim/modifiers.ts";
import { WAVES } from "../src/sim/combat/waves.ts";
import { runWave } from "../src/sim/combat/runWave.ts";
import { reduceWave, topDamage } from "../src/sim/stats/RunStats.ts";
import { aggregate } from "../src/sim/stats/aggregate.ts";

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

const BUILDS: Record<string, Placement[]> = {
  empty: [],
  "4 crossbows, front row": [
    ["crossbow", { col: 0, row: 0 }],
    ["crossbow", { col: 1, row: 0 }],
    ["crossbow", { col: 2, row: 0 }],
    ["crossbow", { col: 3, row: 0 }],
  ],
  "2 cannons horizontal": [
    ["cannon", { col: 0, row: 0 }, 1],
    ["cannon", { col: 2, row: 0 }, 1],
  ],
  "crossbows + gearbox + pouch": [
    ["crossbow", { col: 0, row: 0 }],
    ["crossbow", { col: 1, row: 0 }],
    ["crossbow", { col: 2, row: 0 }],
    ["crossbow", { col: 3, row: 0 }],
    ["gearbox", { col: 1, row: 1 }],
    ["ammo_pouch", { col: 2, row: 1 }],
  ],
  "cannons + frost + shield": [
    ["cannon", { col: 0, row: 1 }, 1],
    ["cannon", { col: 2, row: 1 }, 1],
    ["frost_flask", { col: 1, row: 2 }],
    ["spiked_shield", { col: 0, row: 0 }],
    ["spiked_shield", { col: 3, row: 0 }],
  ],
};

const seeds = Number(process.argv[2] ?? 10);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log(
  `Backpack Bastion bench · ${seeds} seed(s) · waves ${WAVES[0]!.id}-${WAVES.at(-1)!.id}\n`,
);
for (const [name, placements] of Object.entries(BUILDS)) {
  console.log(`== ${name}`);
  console.log(
    `${pad("wave", 6)}${pad("clear%", 8)}${pad("baseHP", 8)}${pad("ticks", 7)}top damage`,
  );
  const perWave = [];
  for (const wave of WAVES) {
    let cleared = 0;
    let hp = 0;
    let ticks = 0;
    let last;
    for (let seed = 1; seed <= seeds; seed++) {
      const run = runWave({
        backpack: build(placements),
        wave,
        rng: new Rng(seed),
        modifiers: DEFAULT_MODIFIERS,
      });
      if (run.result === "cleared") cleared++;
      hp += run.baseHp;
      ticks += run.ticks;
      last = reduceWave(run.events);
    }
    perWave.push(last!);
    const top = topDamage(last!, 3)
      .map((s) => `${s.key.replace("item:", "")}=${s.totalDamage}`)
      .join(" ");
    console.log(
      `${pad(wave.id, 6)}${pad(Math.round((cleared / seeds) * 100), 8)}${pad((hp / seeds).toFixed(1), 8)}${pad(Math.round(ticks / seeds), 7)}${top || "-"}`,
    );
  }
  const agg = aggregate(perWave);
  console.log(
    `   cleared ${agg.wavesCleared}/${agg.wavesPlayed} · base damage ${agg.baseDamage} · gold ${agg.totalGold}\n`,
  );
}
