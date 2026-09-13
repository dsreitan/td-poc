/**
 * Presentation content is separate from mechanics. The simulation only
 * knows stable ids ("crossbow", "grunt"); everything a player reads or
 * sees comes from a ContentPack. Reskinning the game (new setting, new
 * names, new story, new art) is a new ContentPack, not a code change.
 * See docs/PLAN.md §3.9.
 */

export interface ItemText {
  readonly name: string;
  readonly description: string;
  /** Texture/atlas key for the renderer. Placeholder packs may omit it. */
  readonly sprite?: string;
}

export interface EnemyText {
  readonly name: string;
  readonly description?: string;
  readonly sprite?: string;
}

export interface ContentPack {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly items: Readonly<Record<string, ItemText>>;
  readonly enemies: Readonly<Record<string, EnemyText>>;
  /** UI strings. Keys are stable; values are free text. */
  readonly ui: Readonly<Record<string, string>>;
}
