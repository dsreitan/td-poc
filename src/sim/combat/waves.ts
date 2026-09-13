/**
 * Waves are data. The shop preview is derived from the same data, so the
 * preview can never disagree with the wave. docs/PLAN.md §2.9.
 */
import { LANES } from "./constants.ts";
import { enemyDef, possibleLanes } from "./enemies.ts";

export interface SpawnGroup {
  /** First spawn tick, relative to wave start. */
  readonly tick: number;
  readonly lane: number;
  readonly enemy: string;
  readonly count: number;
  /** Ticks between spawns within the group. */
  readonly spacingTicks: number;
}

export interface WaveDef {
  readonly id: number;
  readonly spawns: readonly SpawnGroup[];
  /** Gold paid on clear. */
  readonly clearBonus: number;
}

export interface LanePreview {
  readonly lane: number;
  /** enemy id -> count of enemies that spawn here */
  readonly counts: Readonly<Record<string, number>>;
  readonly total: number;
  /** Boss ids that may move into this lane mid-wave. */
  readonly bossVisits: readonly string[];
}

export interface WavePreview {
  readonly wave: number;
  readonly lanes: readonly LanePreview[];
  readonly total: number;
  /** Enemy ids present, sorted. */
  readonly enemyTypes: readonly string[];
  /** Tick of the last spawn. */
  readonly lastSpawnTick: number;
}

export function previewWave(def: WaveDef): WavePreview {
  const counts: Record<string, number>[] = Array.from({ length: LANES }, () => ({}));
  const visits: Set<string>[] = Array.from({ length: LANES }, () => new Set<string>());
  const types = new Set<string>();
  let total = 0;
  let last = 0;
  for (const g of def.spawns) {
    const lane = counts[g.lane];
    if (!lane) throw new Error(`Wave ${def.id}: lane ${g.lane} out of range`);
    lane[g.enemy] = (lane[g.enemy] ?? 0) + g.count;
    types.add(g.enemy);
    total += g.count;
    last = Math.max(last, g.tick + (g.count - 1) * g.spacingTicks);
    const ed = enemyDef(g.enemy);
    if (ed.isBoss)
      for (const l of possibleLanes(ed, g.lane, LANES)) if (l !== g.lane) visits[l]!.add(g.enemy);
  }
  return {
    wave: def.id,
    lanes: counts.map((c, lane) => ({
      lane,
      counts: c,
      total: Object.values(c).reduce((a, b) => a + b, 0),
      bossVisits: [...visits[lane]!].sort(),
    })),
    total,
    enemyTypes: [...types].sort(),
    lastSpawnTick: last,
  };
}

/** Individual spawn instants, sorted by tick then lane then group order. */
export function expandSpawns(def: WaveDef): { tick: number; lane: number; enemy: string }[] {
  const out: { tick: number; lane: number; enemy: string; order: number }[] = [];
  def.spawns.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) {
      out.push({ tick: g.tick + i * g.spacingTicks, lane: g.lane, enemy: g.enemy, order: gi });
    }
  });
  out.sort((a, b) => a.tick - b.tick || a.lane - b.lane || a.order - b.order);
  return out.map(({ tick, lane, enemy }) => ({ tick, lane, enemy }));
}

// Ten waves, ~20-35 s each. Lane skews are deliberate so the preview gives
// a reason to move things. docs/PLAN.md §2.9.
export const WAVES: readonly WaveDef[] = [
  {
    id: 1,
    clearBonus: 5,
    spawns: [
      { tick: 0, lane: 1, enemy: "grunt", count: 2, spacingTicks: 40 },
      { tick: 20, lane: 2, enemy: "grunt", count: 2, spacingTicks: 40 },
      { tick: 100, lane: 0, enemy: "grunt", count: 2, spacingTicks: 40 },
      { tick: 120, lane: 3, enemy: "grunt", count: 2, spacingTicks: 40 },
    ],
  },
  {
    id: 2,
    clearBonus: 6,
    spawns: [
      { tick: 0, lane: 0, enemy: "grunt", count: 3, spacingTicks: 35 },
      { tick: 0, lane: 3, enemy: "grunt", count: 3, spacingTicks: 35 },
      { tick: 60, lane: 1, enemy: "grunt", count: 2, spacingTicks: 40 },
      { tick: 60, lane: 2, enemy: "grunt", count: 2, spacingTicks: 40 },
      { tick: 200, lane: 1, enemy: "runner", count: 2, spacingTicks: 30 },
      { tick: 200, lane: 2, enemy: "runner", count: 2, spacingTicks: 30 },
    ],
  },
  {
    id: 3,
    clearBonus: 7,
    // Skew: lanes 2 and 3 carry the runners.
    spawns: [
      { tick: 0, lane: 0, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 0, lane: 1, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 40, lane: 2, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 40, lane: 3, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 160, lane: 2, enemy: "runner", count: 3, spacingTicks: 25 },
      { tick: 180, lane: 3, enemy: "runner", count: 3, spacingTicks: 25 },
    ],
  },
  {
    id: 4,
    clearBonus: 8,
    // Armored arrives, in the two outer lanes.
    spawns: [
      { tick: 0, lane: 0, enemy: "armored", count: 2, spacingTicks: 80 },
      { tick: 0, lane: 3, enemy: "armored", count: 2, spacingTicks: 80 },
      { tick: 30, lane: 1, enemy: "grunt", count: 4, spacingTicks: 30 },
      { tick: 30, lane: 2, enemy: "grunt", count: 4, spacingTicks: 30 },
      { tick: 220, lane: 1, enemy: "runner", count: 2, spacingTicks: 20 },
    ],
  },
  {
    id: 5,
    clearBonus: 12,
    // Mini-boss: Warden in lane 1 with a grunt escort spread wide.
    spawns: [
      { tick: 0, lane: 0, enemy: "grunt", count: 3, spacingTicks: 40 },
      { tick: 0, lane: 3, enemy: "grunt", count: 3, spacingTicks: 40 },
      { tick: 60, lane: 1, enemy: "warden", count: 1, spacingTicks: 0 },
      { tick: 120, lane: 2, enemy: "runner", count: 3, spacingTicks: 30 },
    ],
  },
  {
    id: 6,
    clearBonus: 9,
    // Swarm: lots of small bodies in lanes 1 and 2. Rewards splash.
    spawns: [
      { tick: 0, lane: 1, enemy: "swarmling", count: 7, spacingTicks: 8 },
      { tick: 0, lane: 2, enemy: "swarmling", count: 7, spacingTicks: 8 },
      { tick: 120, lane: 0, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 120, lane: 3, enemy: "armored", count: 1, spacingTicks: 0 },
      { tick: 200, lane: 1, enemy: "swarmling", count: 6, spacingTicks: 8 },
    ],
  },
  {
    id: 7,
    clearBonus: 10,
    // Skew hard left: lanes 0 and 1 take almost everything.
    spawns: [
      { tick: 0, lane: 0, enemy: "armored", count: 3, spacingTicks: 60 },
      { tick: 20, lane: 1, enemy: "grunt", count: 5, spacingTicks: 25 },
      { tick: 100, lane: 0, enemy: "runner", count: 4, spacingTicks: 20 },
      { tick: 160, lane: 1, enemy: "swarmling", count: 6, spacingTicks: 8 },
      { tick: 240, lane: 3, enemy: "runner", count: 2, spacingTicks: 20 },
    ],
  },
  {
    id: 8,
    clearBonus: 11,
    // Skew hard right, faster.
    spawns: [
      { tick: 0, lane: 3, enemy: "armored", count: 3, spacingTicks: 50 },
      { tick: 0, lane: 2, enemy: "runner", count: 5, spacingTicks: 18 },
      { tick: 80, lane: 3, enemy: "swarmling", count: 8, spacingTicks: 7 },
      { tick: 140, lane: 2, enemy: "grunt", count: 5, spacingTicks: 22 },
      { tick: 200, lane: 0, enemy: "grunt", count: 2, spacingTicks: 30 },
    ],
  },
  {
    id: 9,
    clearBonus: 12,
    // Everything, everywhere, in two pulses.
    spawns: [
      { tick: 0, lane: 0, enemy: "runner", count: 4, spacingTicks: 18 },
      { tick: 0, lane: 1, enemy: "armored", count: 2, spacingTicks: 60 },
      { tick: 0, lane: 2, enemy: "swarmling", count: 8, spacingTicks: 7 },
      { tick: 0, lane: 3, enemy: "grunt", count: 5, spacingTicks: 24 },
      { tick: 220, lane: 0, enemy: "armored", count: 2, spacingTicks: 50 },
      { tick: 220, lane: 1, enemy: "swarmling", count: 8, spacingTicks: 7 },
      { tick: 220, lane: 2, enemy: "runner", count: 4, spacingTicks: 18 },
      { tick: 220, lane: 3, enemy: "armored", count: 2, spacingTicks: 50 },
    ],
  },
  {
    id: 10,
    clearBonus: 25,
    // Bulwark spawns in lane 1 and shifts to lane 2 halfway. Escort keeps the flanks busy.
    spawns: [
      { tick: 0, lane: 0, enemy: "grunt", count: 4, spacingTicks: 30 },
      { tick: 0, lane: 3, enemy: "grunt", count: 4, spacingTicks: 30 },
      { tick: 40, lane: 1, enemy: "bulwark", count: 1, spacingTicks: 0 },
      { tick: 100, lane: 2, enemy: "armored", count: 2, spacingTicks: 60 },
      { tick: 200, lane: 0, enemy: "runner", count: 3, spacingTicks: 20 },
      { tick: 200, lane: 3, enemy: "runner", count: 3, spacingTicks: 20 },
      { tick: 300, lane: 1, enemy: "swarmling", count: 6, spacingTicks: 8 },
    ],
  },
];

export function waveDef(id: number): WaveDef {
  const w = WAVES.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown wave: ${id}`);
  return w;
}
