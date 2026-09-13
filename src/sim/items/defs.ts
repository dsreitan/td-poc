/**
 * The item table: MECHANICS ONLY. Tier-1 numbers are from docs/PLAN.md §2.5;
 * tiers 2 and 3 scale by roughly 1.7x and 3x. All numbers are integers; tune
 * here, not in code. Names, descriptions and art live in src/content packs,
 * keyed by these ids, so the game can be reskinned without touching the sim.
 */

import { SHAPE_1X1, SHAPE_1X2 } from "../grid/shapes.ts";
import type { ItemDef, TierData, WeaponStats } from "./types.ts";

function weaponTiers(
  base: WeaponStats,
  scale: (t: 1 | 2 | 3, s: WeaponStats) => WeaponStats,
  effects: TierData["effects"] = [],
): [TierData, TierData, TierData] {
  return [
    { weapon: scale(1, base), effects },
    { weapon: scale(2, base), effects },
    { weapon: scale(3, base), effects },
  ];
}

/** Damage x1 / x1.7 / x3, cooldown unchanged. */
function dmgScale(t: 1 | 2 | 3, s: WeaponStats): WeaponStats {
  const mult = t === 1 ? 10 : t === 2 ? 17 : 30;
  return { ...s, damage: Math.floor((s.damage * mult) / 10) };
}

export const ITEM_DEFS: readonly ItemDef[] = [
  // ------------------------------------------------------------- weapons
  {
    id: "crossbow",
    shape: SHAPE_1X1,
    itemClass: "projectileWeapon",
    rarity: "common",
    cost: 3,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 3, cooldownTicks: 15 }, dmgScale),
  },
  {
    id: "cannon",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "uncommon",
    cost: 6,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 8, cooldownTicks: 50, splashRange: 60 }, dmgScale),
  },
  {
    id: "flame_lance",
    shape: SHAPE_1X1,
    itemClass: "magicWeapon",
    rarity: "uncommon",
    cost: 5,
    tiers: weaponTiers({ damage: 1, cooldownTicks: 5, ignoresArmor: true }, dmgScale),
  },
  {
    id: "ballista",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 7,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 12, cooldownTicks: 70, pierce: 3 }, dmgScale),
  },
  // ------------------------------------------------------------ supports
  {
    id: "frost_flask",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "common",
    cost: 3,
    tiers: [
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 30, magnitude: 30 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 40, magnitude: 40 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 50, magnitude: 50 }] },
    ],
  },
  {
    id: "gearbox",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "common",
    cost: 3,
    tiers: [
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 25 }] },
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 40 }] },
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 60 }] },
    ],
  },
  {
    id: "ammo_pouch",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "common",
    cost: 3,
    ports: { provides: ["ammo"] },
    tiers: [
      {
        effects: [
          {
            kind: "buffAdjacent",
            buff: "flatDamage",
            amount: 2,
            onlyClasses: ["projectileWeapon"],
          },
        ],
      },
      {
        effects: [
          {
            kind: "buffAdjacent",
            buff: "flatDamage",
            amount: 3,
            onlyClasses: ["projectileWeapon"],
          },
        ],
      },
      {
        effects: [
          {
            kind: "buffAdjacent",
            buff: "flatDamage",
            amount: 5,
            onlyClasses: ["projectileWeapon"],
          },
        ],
      },
    ],
  },
  {
    id: "fire_rune",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "uncommon",
    cost: 4,
    tiers: [
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 20, magnitude: 1 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 25, magnitude: 2 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 30, magnitude: 3 }] },
    ],
  },
  {
    id: "lodestone",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "rare",
    cost: 6,
    tiers: [
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 1 }] },
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 1 }] },
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 2 }] },
    ],
  },
  // ----------------------------------------------------------- defensive
  {
    id: "spiked_shield",
    shape: SHAPE_1X1,
    itemClass: "defensive",
    rarity: "common",
    cost: 3,
    tiers: [
      { defensive: { chargesPerWave: 1, retaliationDamage: 6 }, effects: [] },
      { defensive: { chargesPerWave: 2, retaliationDamage: 10 }, effects: [] },
      { defensive: { chargesPerWave: 3, retaliationDamage: 18 }, effects: [] },
    ],
  },
  {
    id: "iron_wall",
    shape: SHAPE_1X2,
    itemClass: "defensive",
    rarity: "uncommon",
    cost: 5,
    tiers: [
      { defensive: { chargesPerWave: 3, retaliationDamage: 0 }, effects: [] },
      { defensive: { chargesPerWave: 5, retaliationDamage: 0 }, effects: [] },
      { defensive: { chargesPerWave: 8, retaliationDamage: 0 }, effects: [] },
    ],
  },
  // ------------------------------------------------------------- economy
  {
    id: "coin_purse",
    shape: SHAPE_1X1,
    itemClass: "economy",
    rarity: "common",
    cost: 4,
    tiers: [
      { effects: [{ kind: "goldPerWave", amount: 2 }] },
      { effects: [{ kind: "goldPerWave", amount: 4 }] },
      { effects: [{ kind: "goldPerWave", amount: 7 }] },
    ],
  },
  // ------------------------------------------------------ crafted results
  {
    id: "flaming_repeater",
    shape: SHAPE_1X1,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 8,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 3, cooldownTicks: 10 }, dmgScale, [
      { kind: "statusOnHit", status: "burn", ticks: 20, magnitude: 1 },
    ]),
  },
  {
    id: "glacier_mortar",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 10,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 8, cooldownTicks: 50, splashRange: 60 }, dmgScale, [
      { kind: "statusOnHit", status: "slow", ticks: 30, magnitude: 50 },
    ]),
  },
  {
    id: "siege_engine",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 11,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 18, cooldownTicks: 70, pierce: 99 }, dmgScale),
  },
];

const BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEM_DEFS.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown item def: ${id}`);
  return d;
}

export function hasItemDef(id: string): boolean {
  return BY_ID.has(id);
}

/** Items that can appear in the shop (not crafted-only), sorted by id. */
export const SHOP_ITEM_DEFS: readonly ItemDef[] = ITEM_DEFS.filter((d) => !d.craftedOnly).sort(
  (a, b) => (a.id < b.id ? -1 : 1),
);
