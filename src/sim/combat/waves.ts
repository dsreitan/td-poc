/**
 * Waves are data. The shop preview is derived from the same data, so the
 * preview can never disagree with the wave. docs/PLAN.md §2.9.
 */
import { LANES } from "./constants.ts";

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
  /** enemy id -> count */
  readonly counts: Readonly<Record<string, number>>;
  readonly total: number;
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
  }
  return {
    wave: def.id,
    lanes: counts.map((c, lane) => ({
      lane,
      counts: c,
      total: Object.values(c).reduce((a, b) => a + b, 0),
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

// M2 ships waves 1-3 (grunts, then runners). Waves 4-10 land in M4.
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
    // Deliberate skew: lanes 2 and 3 carry the runners.
    spawns: [
      { tick: 0, lane: 0, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 0, lane: 1, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 40, lane: 2, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 40, lane: 3, enemy: "grunt", count: 3, spacingTicks: 30 },
      { tick: 160, lane: 2, enemy: "runner", count: 3, spacingTicks: 25 },
      { tick: 180, lane: 3, enemy: "runner", count: 3, spacingTicks: 25 },
    ],
  },
];

export function waveDef(id: number): WaveDef {
  const w = WAVES.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown wave: ${id}`);
  return w;
}
