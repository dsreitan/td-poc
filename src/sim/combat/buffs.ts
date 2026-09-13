/**
 * Derive what each weapon receives from adjacent supports. Computed once at
 * wave start from the adjacency graph (the backpack is locked during a
 * wave). Flow (§3.8) will be a second pass over the same graph.
 */
import type { Backpack, PlacedItem } from "../grid/Backpack.ts";
import type { SimEvent } from "../events.ts";
import { itemDef } from "../items/defs.ts";
import { isWeapon, tierData, type BuffKind, type StatusKind } from "../items/types.ts";

export interface Buff {
  readonly buff: BuffKind;
  readonly amount: number;
  readonly byItemId: string;
}

export interface OnHitStatus {
  readonly status: StatusKind;
  readonly ticks: number;
  readonly magnitude: number;
  /** Item credited for the status (the support, or the weapon itself). */
  readonly byItemId: string;
}

export interface WeaponBuffs {
  readonly buffs: readonly Buff[];
  readonly onHit: readonly OnHitStatus[];
}

const STATUS_BUFF: Record<StatusKind, BuffKind> = { slow: "slowOnHit", burn: "burnOnHit" };

/**
 * Returns per-weapon buffs plus the buffApplied events describing them.
 * Deterministic: items and neighbours are visited in id order.
 */
export function deriveBuffs(bp: Backpack): {
  byWeapon: Map<string, WeaponBuffs>;
  events: SimEvent[];
} {
  const byWeapon = new Map<string, { buffs: Buff[]; onHit: OnHitStatus[] }>();
  const events: SimEvent[] = [];
  const get = (id: string) => {
    let w = byWeapon.get(id);
    if (!w) {
      w = { buffs: [], onHit: [] };
      byWeapon.set(id, w);
    }
    return w;
  };

  for (const item of bp.all()) {
    const def = itemDef(item.defId);
    const td = tierData(def, item.tier);

    // A weapon's own on-hit statuses (crafted results).
    if (isWeapon(def)) {
      for (const e of td.effects) {
        if (e.kind === "statusOnHit") {
          get(item.id).onHit.push({
            status: e.status,
            ticks: e.ticks,
            magnitude: e.magnitude,
            byItemId: item.id,
          });
        }
      }
    }

    // Grants to adjacent weapons.
    const neighbours = bp.neighbours(item.id).filter((n: PlacedItem) => isWeapon(itemDef(n.defId)));
    for (const e of td.effects) {
      if (e.kind === "buffAdjacent") {
        for (const n of neighbours) {
          if (e.onlyClasses && !e.onlyClasses.includes(itemDef(n.defId).itemClass)) continue;
          get(n.id).buffs.push({ buff: e.buff, amount: e.amount, byItemId: item.id });
          events.push({
            t: "buffApplied",
            itemId: n.id,
            byItemId: item.id,
            buff: e.buff,
            amount: e.amount,
          });
        }
      } else if (e.kind === "statusOnHitAdjacent") {
        for (const n of neighbours) {
          get(n.id).onHit.push({
            status: e.status,
            ticks: e.ticks,
            magnitude: e.magnitude,
            byItemId: item.id,
          });
          events.push({
            t: "buffApplied",
            itemId: n.id,
            byItemId: item.id,
            buff: STATUS_BUFF[e.status],
            amount: e.magnitude,
          });
        }
      }
    }
  }
  return { byWeapon, events };
}

export function sumBuff(buffs: readonly Buff[], kind: BuffKind): number {
  let n = 0;
  for (const b of buffs) if (b.buff === kind) n += b.amount;
  return n;
}
