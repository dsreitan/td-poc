import { PLACEHOLDER_PACK } from "./packs/placeholder.ts";
import type { ContentPack, EnemyText, ItemText } from "./types.ts";

export type { ContentPack, EnemyText, ItemText } from "./types.ts";
export { PLACEHOLDER_PACK } from "./packs/placeholder.ts";

/** The active pack. One assignment to reskin the whole game. */
export const CONTENT: ContentPack = PLACEHOLDER_PACK;

export function itemText(pack: ContentPack, id: string): ItemText {
  return pack.items[id] ?? { name: id, description: "" };
}

export function enemyText(pack: ContentPack, id: string): EnemyText {
  return pack.enemies[id] ?? { name: id };
}

export function ui(pack: ContentPack, key: string): string {
  return pack.ui[key] ?? key;
}
