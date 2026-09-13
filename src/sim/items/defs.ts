/**
 * The item table. Tier-1 numbers are from docs/PLAN.md §2.5; tiers 2 and 3
 * scale by roughly 1.7x and 3x. All numbers are integers; tune here, not in
 * code.
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
    name: "Crossbow",
    shape: SHAPE_1X1,
    itemClass: "projectileWeapon",
    rarity: "common",
    cost: 3,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 3, cooldownTicks: 15 }, dmgScale),
    description: "Fires a bolt at the front enemy in its column.",
  },
  {
    id: "cannon",
    name: "Cannon",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "uncommon",
    cost: 6,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 8, cooldownTicks: 50, splashRange: 60 }, dmgScale),
    description: "Slow shell with splash. Covers every column it occupies.",
  },
  {
    id: "flame_lance",
    name: "Flame lance",
    shape: SHAPE_1X1,
    itemClass: "magicWeapon",
    rarity: "uncommon",
    cost: 5,
    tiers: weaponTiers({ damage: 1, cooldownTicks: 5, ignoresArmor: true }, dmgScale),
    description: "Continuous flame on the front enemy. Ignores armor.",
  },
  {
    id: "ballista",
    name: "Ballista",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 7,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 12, cooldownTicks: 70, pierce: 3 }, dmgScale),
    description: "Heavy bolt that pierces up to three enemies in the column.",
  },
  // ------------------------------------------------------------ supports
  {
    id: "frost_flask",
    name: "Frost flask",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "common",
    cost: 3,
    tiers: [
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 30, magnitude: 30 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 40, magnitude: 40 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "slow", ticks: 50, magnitude: 50 }] },
    ],
    description: "Adjacent weapons slow the enemies they hit.",
  },
  {
    id: "gearbox",
    name: "Gearbox",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "common",
    cost: 3,
    tiers: [
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 25 }] },
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 40 }] },
      { effects: [{ kind: "buffAdjacent", buff: "attackSpeedPct", amount: 60 }] },
    ],
    description: "Adjacent weapons attack faster.",
  },
  {
    id: "ammo_pouch",
    name: "Ammunition pouch",
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
    description: "Adjacent projectile weapons deal more damage.",
  },
  {
    id: "fire_rune",
    name: "Fire rune",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "uncommon",
    cost: 4,
    tiers: [
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 20, magnitude: 1 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 25, magnitude: 2 }] },
      { effects: [{ kind: "statusOnHitAdjacent", status: "burn", ticks: 30, magnitude: 3 }] },
    ],
    description: "Adjacent weapons set enemies on fire. Also a crafting reagent.",
  },
  {
    id: "lodestone",
    name: "Lodestone",
    shape: SHAPE_1X1,
    itemClass: "support",
    rarity: "rare",
    cost: 6,
    tiers: [
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 1 }] },
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 1 }] },
      { effects: [{ kind: "buffAdjacent", buff: "laneReach", amount: 2 }] },
    ],
    description: "Adjacent weapons can also target neighbouring lanes.",
  },
  // ----------------------------------------------------------- defensive
  {
    id: "spiked_shield",
    name: "Spiked shield",
    shape: SHAPE_1X1,
    itemClass: "defensive",
    rarity: "common",
    cost: 3,
    tiers: [
      { defensive: { chargesPerWave: 1, retaliationDamage: 6 }, effects: [] },
      { defensive: { chargesPerWave: 2, retaliationDamage: 10 }, effects: [] },
      { defensive: { chargesPerWave: 3, retaliationDamage: 18 }, effects: [] },
    ],
    description: "Blocks a breach in its column and damages the attacker.",
  },
  {
    id: "iron_wall",
    name: "Iron wall",
    shape: SHAPE_1X2,
    itemClass: "defensive",
    rarity: "uncommon",
    cost: 5,
    tiers: [
      { defensive: { chargesPerWave: 3, retaliationDamage: 0 }, effects: [] },
      { defensive: { chargesPerWave: 5, retaliationDamage: 0 }, effects: [] },
      { defensive: { chargesPerWave: 8, retaliationDamage: 0 }, effects: [] },
    ],
    description: "Absorbs several breaches per wave.",
  },
  // ------------------------------------------------------------- economy
  {
    id: "coin_purse",
    name: "Coin purse",
    shape: SHAPE_1X1,
    itemClass: "economy",
    rarity: "common",
    cost: 4,
    tiers: [
      { effects: [{ kind: "goldPerWave", amount: 2 }] },
      { effects: [{ kind: "goldPerWave", amount: 4 }] },
      { effects: [{ kind: "goldPerWave", amount: 7 }] },
    ],
    description: "Earns gold every wave. Takes up valuable space.",
  },
  // ------------------------------------------------------ crafted results
  {
    id: "flaming_repeater",
    name: "Flaming repeater",
    shape: SHAPE_1X1,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 8,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 3, cooldownTicks: 10 }, dmgScale, [
      { kind: "statusOnHit", status: "burn", ticks: 20, magnitude: 1 },
    ]),
    description: "Fire rune + Crossbow. Rapid bolts that burn.",
  },
  {
    id: "glacier_mortar",
    name: "Glacier mortar",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 10,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 8, cooldownTicks: 50, splashRange: 60 }, dmgScale, [
      { kind: "statusOnHit", status: "slow", ticks: 30, magnitude: 50 },
    ]),
    description: "Frost flask + Cannon. Splash that slows.",
  },
  {
    id: "siege_engine",
    name: "Siege engine",
    shape: SHAPE_1X2,
    itemClass: "projectileWeapon",
    rarity: "rare",
    cost: 11,
    craftedOnly: true,
    ports: { consumes: ["ammo"] },
    tiers: weaponTiers({ damage: 18, cooldownTicks: 70, pierce: 99 }, dmgScale),
    description: "Ammunition pouch + Ballista. Pierces the whole column.",
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
