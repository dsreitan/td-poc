/**
 * Item definition types. Items are DATA: a definition table in defs.ts plus
 * typed effect records. Nothing here executes; the combat sim interprets
 * effect records. See docs/PLAN.md §1.4, §2.5, §3.8.
 */

import type { Shape } from "../grid/shapes.ts";

export type Tier = 1 | 2 | 3;

export type ItemClass = "projectileWeapon" | "magicWeapon" | "support" | "defensive" | "economy";

export type Rarity = "common" | "uncommon" | "rare";

/** Resource kinds for the (future) factory layer. Only `ammo` is referenced in the POC. */
export type ResourceKind = "ammo" | "heat" | "mana";

export type StatusKind = "slow" | "burn";

/** Buffs a support grants to an adjacent weapon. `*OnHit` carry a status magnitude. */
export type BuffKind = "attackSpeedPct" | "flatDamage" | "laneReach" | "slowOnHit" | "burnOnHit";

export interface Ports {
  readonly provides?: readonly ResourceKind[];
  readonly consumes?: readonly ResourceKind[];
}

/** Per-tier weapon numbers. Durations and cooldowns are in ticks (20/s). */
export interface WeaponStats {
  readonly damage: number;
  readonly cooldownTicks: number;
  /** Splash radius in lane units (0 = none). */
  readonly splashRange?: number;
  /** Max enemies hit per shot along the column (1 = none). */
  readonly pierce?: number;
  /** Ignores flat armor reduction. */
  readonly ignoresArmor?: boolean;
}

export interface DefensiveStats {
  readonly chargesPerWave: number;
  readonly retaliationDamage: number;
}

/**
 * Typed effect records. Adding a new mechanic later means adding a new
 * `kind` here and a new case in the sim, not a new system.
 */
export type Effect =
  | {
      readonly kind: "buffAdjacent";
      readonly buff: BuffKind;
      readonly amount: number;
      readonly onlyClasses?: readonly ItemClass[];
    }
  | {
      readonly kind: "statusOnHitAdjacent";
      readonly status: StatusKind;
      readonly ticks: number;
      readonly magnitude: number;
    }
  | {
      readonly kind: "statusOnHit";
      readonly status: StatusKind;
      readonly ticks: number;
      readonly magnitude: number;
    }
  | { readonly kind: "goldPerWave"; readonly amount: number }
  | {
      readonly kind: "produceResource";
      readonly resource: ResourceKind;
      readonly amountPerTick: number;
    };

export interface TierData {
  readonly weapon?: WeaponStats;
  readonly defensive?: DefensiveStats;
  readonly effects: readonly Effect[];
}

export interface ItemDef {
  /** Stable internal key. Content packs map it to a display name and art. */
  readonly id: string;
  readonly shape: Shape;
  readonly itemClass: ItemClass;
  readonly rarity: Rarity;
  /** Base shop price at tier 1. */
  readonly cost: number;
  readonly ports?: Ports;
  /** Index 0 = tier 1. Always exactly three entries. */
  readonly tiers: readonly [TierData, TierData, TierData];
  /** True for items that only exist as recipe results (never in the shop). */
  readonly craftedOnly?: boolean;
}

export function tierData(def: ItemDef, tier: Tier): TierData {
  switch (tier) {
    case 1:
      return def.tiers[0];
    case 2:
      return def.tiers[1];
    case 3:
      return def.tiers[2];
  }
}

export function isWeapon(def: ItemDef): boolean {
  return def.itemClass === "projectileWeapon" || def.itemClass === "magicWeapon";
}
