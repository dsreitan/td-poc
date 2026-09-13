/**
 * Stats are a pure fold over the event stream. Nothing here is counted by
 * the combat sim. Works incrementally (live HUD meter) and in batch
 * (post-wave screen). docs/PLAN.md §3.7.
 */
import { sourceKey, type SimEvent, type Source, type TaggedEvent } from "../events.ts";
import type { BuffKind, StatusKind } from "../items/types.ts";
import { LANES } from "../combat/constants.ts";

export type DamageVia = "shot" | "splash" | "burn" | "pierce" | "retaliation" | "status";

export interface SourceStats {
  readonly key: string;
  readonly source: Source;
  damage: Record<DamageVia, number>;
  totalDamage: number;
  kills: number;
  overkill: number;
  shots: number;
  buffsGranted: { to: string; buff: BuffKind; amount: number }[];
  buffsReceived: { from: string; buff: BuffKind; amount: number }[];
  /** Status applications credited to this source. */
  statusesApplied: Record<StatusKind, { count: number; ticks: number }>;
  blocks: number;
  gold: number;
}

export interface LaneStats {
  spawned: number;
  breaches: number;
  blocked: number;
  baseDamage: number;
}

export interface WaveStats {
  wave: number;
  ticks: number;
  result?: "cleared" | "baseDestroyed";
  baseHpEnd?: number;
  baseDamage: number;
  enemiesSpawned: number;
  enemiesKilled: number;
  totalGold: number;
  abilitiesUsed: number;
  sources: Record<string, SourceStats>;
  lanes: LaneStats[];
}

function emptySource(source: Source): SourceStats {
  return {
    key: sourceKey(source),
    source,
    damage: { shot: 0, splash: 0, burn: 0, pierce: 0, retaliation: 0, status: 0 },
    totalDamage: 0,
    kills: 0,
    overkill: 0,
    shots: 0,
    buffsGranted: [],
    buffsReceived: [],
    statusesApplied: { slow: { count: 0, ticks: 0 }, burn: { count: 0, ticks: 0 } },
    blocks: 0,
    gold: 0,
  };
}

function itemSource(itemId: string): Source {
  return { kind: "item", itemId, via: "shot" };
}

export class StatsAccumulator {
  readonly stats: WaveStats;
  private readonly enemyLane = new Map<number, number>();

  constructor(wave = 0) {
    this.stats = {
      wave,
      ticks: 0,
      baseDamage: 0,
      enemiesSpawned: 0,
      enemiesKilled: 0,
      totalGold: 0,
      abilitiesUsed: 0,
      sources: {},
      lanes: Array.from({ length: LANES }, () => ({
        spawned: 0,
        breaches: 0,
        blocked: 0,
        baseDamage: 0,
      })),
    };
  }

  private src(source: Source): SourceStats {
    const key = sourceKey(source);
    let s = this.stats.sources[key];
    if (!s) {
      s = emptySource(source);
      this.stats.sources[key] = s;
    }
    return s;
  }

  push(e: TaggedEvent): void {
    this.stats.ticks = Math.max(this.stats.ticks, e.tick + 1);
    this.apply(e.ev);
  }

  pushAll(events: readonly TaggedEvent[]): this {
    for (const e of events) this.push(e);
    return this;
  }

  private apply(ev: SimEvent): void {
    const st = this.stats;
    switch (ev.t) {
      case "waveStarted":
        st.wave = ev.wave;
        break;
      case "buffApplied":
        this.src(itemSource(ev.byItemId)).buffsGranted.push({
          to: ev.itemId,
          buff: ev.buff,
          amount: ev.amount,
        });
        this.src(itemSource(ev.itemId)).buffsReceived.push({
          from: ev.byItemId,
          buff: ev.buff,
          amount: ev.amount,
        });
        break;
      case "enemySpawned":
        st.enemiesSpawned++;
        st.lanes[ev.lane]!.spawned++;
        this.enemyLane.set(ev.id, ev.lane);
        break;
      case "weaponFired":
        this.src(itemSource(ev.itemId)).shots++;
        break;
      case "enemyDamaged": {
        const s = this.src(ev.source);
        const via: DamageVia = ev.source.kind === "item" ? ev.source.via : "shot";
        s.damage[via] += ev.amount;
        s.totalDamage += ev.amount;
        s.overkill += ev.overkill;
        break;
      }
      case "enemyKilled":
        st.enemiesKilled++;
        this.src(ev.source).kills++;
        break;
      case "statusApplied": {
        const s = this.src(ev.source).statusesApplied[ev.status];
        s.count++;
        s.ticks += ev.ticks;
        break;
      }
      case "goldEarned":
        st.totalGold += ev.amount;
        this.src(ev.source).gold += ev.amount;
        break;
      case "breach": {
        const lane = st.lanes[ev.lane]!;
        lane.breaches++;
        if (ev.absorbedBy !== undefined) {
          lane.blocked++;
          this.src(itemSource(ev.absorbedBy)).blocks++;
        } else {
          lane.baseDamage += ev.baseDamage;
          st.baseDamage += ev.baseDamage;
        }
        break;
      }
      case "abilityUsed":
        st.abilitiesUsed++;
        break;
      case "waveEnded":
        st.result = ev.result;
        st.baseHpEnd = ev.baseHp;
        st.ticks = ev.ticks;
        break;
      default:
        // enemyMoved, statusExpired, itemChargeUsed, abilityUsed, bossPhaseEntered,
        // itemXpGained, resourceTransferred: no stat yet.
        break;
    }
  }
}

export function reduceWave(events: readonly TaggedEvent[]): WaveStats {
  return new StatsAccumulator().pushAll(events).stats;
}

/** Top damage sources, descending. Ties by key for determinism. */
export function topDamage(stats: WaveStats, n = 5): SourceStats[] {
  return Object.values(stats.sources)
    .filter((s) => s.totalDamage > 0)
    .sort((a, b) => b.totalDamage - a.totalDamage || (a.key < b.key ? -1 : 1))
    .slice(0, n);
}
