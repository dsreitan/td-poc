/**
 * Merge: dropping an item onto an identical item of the same tier raises
 * the target one tier and consumes the dragged item. docs/PLAN.md §2.5.
 */
import type { Tier } from "./types.ts";

export interface Mergeable {
  readonly defId: string;
  readonly tier: Tier;
}

export function canMerge(dragged: Mergeable, target: Mergeable): boolean {
  return dragged.defId === target.defId && dragged.tier === target.tier && target.tier < 3;
}

export function mergedTier(tier: Tier): Tier {
  return tier === 1 ? 2 : 3;
}
