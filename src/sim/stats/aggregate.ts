import type { SourceStats, WaveStats } from "./RunStats.ts";

export interface RunStats {
  readonly wavesPlayed: number;
  readonly wavesCleared: number;
  readonly totalTicks: number;
  readonly totalGold: number;
  readonly baseDamage: number;
  readonly enemiesKilled: number;
  /** Summed per source across waves. */
  readonly sources: Record<string, SourceStats>;
  /** Wave with the highest total damage dealt. */
  readonly bestWave?: number;
  readonly perWave: readonly WaveStats[];
}

export function aggregate(waves: readonly WaveStats[]): RunStats {
  const sources: Record<string, SourceStats> = {};
  let bestWave: number | undefined;
  let bestDamage = -1;
  for (const w of waves) {
    let dmg = 0;
    for (const s of Object.values(w.sources)) {
      dmg += s.totalDamage;
      const acc = sources[s.key];
      if (!acc) {
        sources[s.key] = structuredClone(s);
        continue;
      }
      for (const via of Object.keys(s.damage) as (keyof SourceStats["damage"])[])
        acc.damage[via] += s.damage[via];
      acc.totalDamage += s.totalDamage;
      acc.kills += s.kills;
      acc.overkill += s.overkill;
      acc.shots += s.shots;
      acc.buffsGranted.push(...s.buffsGranted);
      acc.buffsReceived.push(...s.buffsReceived);
      for (const k of ["slow", "burn"] as const) {
        acc.statusesApplied[k].count += s.statusesApplied[k].count;
        acc.statusesApplied[k].ticks += s.statusesApplied[k].ticks;
      }
      acc.blocks += s.blocks;
      acc.gold += s.gold;
    }
    if (dmg > bestDamage) {
      bestDamage = dmg;
      bestWave = w.wave;
    }
  }
  const out: RunStats = {
    wavesPlayed: waves.length,
    wavesCleared: waves.filter((w) => w.result === "cleared").length,
    totalTicks: waves.reduce((a, w) => a + w.ticks, 0),
    totalGold: waves.reduce((a, w) => a + w.totalGold, 0),
    baseDamage: waves.reduce((a, w) => a + w.baseDamage, 0),
    enemiesKilled: waves.reduce((a, w) => a + w.enemiesKilled, 0),
    sources,
    perWave: waves,
    ...(bestWave !== undefined ? { bestWave } : {}),
  };
  return out;
}
