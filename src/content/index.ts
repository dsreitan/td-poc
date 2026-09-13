import { PLACEHOLDER_PACK } from "./packs/placeholder.ts";
import { SCIFI_PACK } from "./packs/scifi.ts";
import type { ContentPack, EnemyText, ItemText } from "./types.ts";

export type { ContentPack, EnemyText, ItemText } from "./types.ts";
export { PLACEHOLDER_PACK } from "./packs/placeholder.ts";
export { SCIFI_PACK } from "./packs/scifi.ts";

/** Every pack the build knows about, by id. */
export const PACKS: Readonly<Record<string, ContentPack>> = {
  [PLACEHOLDER_PACK.id]: PLACEHOLDER_PACK,
  [SCIFI_PACK.id]: SCIFI_PACK,
};

/**
 * The active pack. A live binding: `selectPack()` reskins the whole game
 * for every importer. Selected once at startup (`?pack=scifi`), never
 * mid-run.
 */
export let CONTENT: ContentPack = PLACEHOLDER_PACK;

export function selectPack(id: string | null | undefined): ContentPack {
  CONTENT = (id && PACKS[id]) || PLACEHOLDER_PACK;
  return CONTENT;
}

export function itemText(pack: ContentPack, id: string): ItemText {
  return pack.items[id] ?? { name: id, description: "" };
}

export function enemyText(pack: ContentPack, id: string): EnemyText {
  return pack.enemies[id] ?? { name: id };
}

export function ui(pack: ContentPack, key: string): string {
  return pack.ui[key] ?? key;
}
