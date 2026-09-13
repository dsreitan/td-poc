/**
 * Everything the simulation produces leaves as one of these events. The
 * renderer animates them; stats fold them; replays hash them.
 * docs/PLAN.md §3.3.
 */
import type { BuffKind, ResourceKind, StatusKind } from "./items/types.ts";

/** Who caused an effect. Every damage / status / gold event carries one. */
export type Source =
  | {
      readonly kind: "item";
      readonly itemId: string;
      readonly via: "shot" | "splash" | "burn" | "pierce" | "retaliation" | "status";
    }
  | { readonly kind: "ability"; readonly ability: "volley" }
  | { readonly kind: "boss"; readonly bossId: number; readonly phase: number }
  | { readonly kind: "wave" };

export type SimEvent =
  | { readonly t: "waveStarted"; readonly wave: number }
  | {
      readonly t: "buffApplied";
      readonly itemId: string;
      readonly byItemId: string;
      readonly buff: BuffKind;
      readonly amount: number;
    }
  | {
      readonly t: "enemySpawned";
      readonly id: number;
      readonly type: string;
      readonly lane: number;
    }
  | { readonly t: "enemyMoved"; readonly id: number; readonly pos: number }
  | {
      readonly t: "weaponFired";
      readonly itemId: string;
      readonly targetId: number;
      readonly lane: number;
    }
  | {
      readonly t: "enemyDamaged";
      readonly id: number;
      readonly amount: number;
      readonly hp: number;
      readonly source: Source;
      readonly overkill: number;
    }
  | { readonly t: "enemyKilled"; readonly id: number; readonly source: Source }
  | {
      readonly t: "statusApplied";
      readonly id: number;
      readonly status: StatusKind;
      readonly ticks: number;
      readonly magnitude: number;
      readonly source: Source;
    }
  | { readonly t: "statusExpired"; readonly id: number; readonly status: StatusKind }
  | { readonly t: "goldEarned"; readonly amount: number; readonly source: Source }
  | {
      readonly t: "breach";
      readonly id: number;
      readonly lane: number;
      readonly absorbedBy?: string;
      readonly baseDamage: number;
    }
  | { readonly t: "itemChargeUsed"; readonly itemId: string; readonly remaining: number }
  | { readonly t: "abilityUsed"; readonly lane: number }
  | { readonly t: "bossPhaseEntered"; readonly bossId: number; readonly phase: number }
  | {
      readonly t: "itemXpGained";
      readonly itemId: string;
      readonly amount: number;
      readonly source: Source;
    }
  | {
      readonly t: "resourceTransferred";
      readonly from: string;
      readonly to: string;
      readonly resource: ResourceKind;
      readonly amount: number;
    }
  | {
      readonly t: "waveEnded";
      readonly result: "cleared" | "baseDestroyed";
      readonly ticks: number;
      readonly baseHp: number;
    };

/** An event with the tick it happened on. Stats and replays work on these. */
export interface TaggedEvent {
  readonly tick: number;
  readonly ev: SimEvent;
}

/** Stable string key for a Source, used by stats. */
export function sourceKey(s: Source): string {
  switch (s.kind) {
    case "item":
      return `item:${s.itemId}`;
    case "ability":
      return `ability:${s.ability}`;
    case "boss":
      return `boss:${s.bossId}`;
    case "wave":
      return "wave";
  }
}
