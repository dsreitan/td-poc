/**
 * A run: shop -> wave -> shop -> ... -> won | lost. Pure state machine over
 * the backpack, the shop and one WaveSim at a time. The renderer calls
 * these methods and animates the events. docs/PLAN.md §2.4.
 */
import { WaveSim } from "./combat/WaveSim.ts";
import { WAVES, type WaveDef } from "./combat/waves.ts";
import type { SimEvent, TaggedEvent } from "./events.ts";
import { Backpack, type PlacedItem, type PlacementResult } from "./grid/Backpack.ts";
import type { Cell, Orientation } from "./grid/shapes.ts";
import { itemDef, SHOP_ITEM_DEFS } from "./items/defs.ts";
import { canMerge, mergedTier } from "./items/merge.ts";
import { findRecipe } from "./items/recipes.ts";
import { tierData, type ItemDef, type Tier } from "./items/types.ts";
import { DEFAULT_MODIFIERS, type RunModifiers } from "./modifiers.ts";
import { Rng } from "./rng.ts";
import { reduceWave, type WaveStats } from "./stats/RunStats.ts";

export type RunPhase = "shop" | "wave" | "won" | "lost";

export interface ShopOffer {
  readonly defId: string;
  readonly cost: number;
}

export type BuyResult =
  | PlacementResult
  | {
      readonly ok: false;
      readonly reason: "notEnoughGold" | "noOffer" | "locked" | "benchFull" | "benchEmpty";
    };

/** What dropping `dragged` onto `target` would do. */
export type CombineKind = "merge" | "craft";

export interface CombinePreview {
  readonly kind: CombineKind;
  /** Resulting def id at the target's position. */
  readonly resultDefId: string;
  readonly resultTier: Tier;
}

export type CombineResult =
  | { readonly ok: true; readonly kind: CombineKind; readonly resultId: string }
  | {
      readonly ok: false;
      readonly reason:
        | "noCombine"
        | "doesNotFit"
        | "locked"
        | "notEnoughGold"
        | "noOffer"
        | "benchEmpty"
        | "unknownItem";
    };

export type DragSource =
  | { readonly from: "grid"; readonly itemId: string }
  | { readonly from: "bench" }
  | { readonly from: "offer"; readonly index: number };

export const SHOP_SIZE = 4;
export const REROLL_BASE_COST = 2;

/** Versioned, JSON-safe snapshot of a run between waves. Never saved mid-wave. */
export interface RunSave {
  readonly v: 1;
  readonly seed: number;
  readonly rngState: number;
  readonly modifiers: RunModifiers;
  readonly waveIndex: number;
  readonly gold: number;
  readonly baseHp: number;
  readonly items: readonly PlacedItem[];
  readonly bench: BenchItem | null;
  readonly offers: readonly (ShopOffer | null)[];
  readonly rerolls: number;
  readonly nextItemId: number;
  readonly waveStats: readonly WaveStats[];
}

/** An owned item that is not in the grid. */
export interface BenchItem {
  readonly id: string;
  readonly defId: string;
  readonly tier: Tier;
}

export interface RunOptions {
  readonly seed: number;
  readonly modifiers?: RunModifiers;
  readonly waves?: readonly WaveDef[];
  /** Restore from a save instead of starting fresh. */
  readonly restore?: RunSave;
}

export class Run {
  readonly seed: number;
  readonly modifiers: RunModifiers;
  readonly waves: readonly WaveDef[];
  readonly backpack = new Backpack();
  readonly waveStats: WaveStats[] = [];

  private readonly rng: Rng;
  private _phase: RunPhase = "shop";
  private _gold: number;
  private _baseHp: number;
  private _waveIndex = 0;
  private _offers: (ShopOffer | null)[] = [];
  private _bench: BenchItem | null = null;
  private _rerolls = 0;
  private nextItemId = 1;
  private sim: WaveSim | undefined;
  private waveEvents: TaggedEvent[] = [];

  constructor(opts: RunOptions) {
    this.seed = opts.seed;
    this.modifiers = opts.modifiers ?? DEFAULT_MODIFIERS;
    this.waves = opts.waves ?? WAVES;
    const r = opts.restore;
    if (r) {
      if (r.v !== 1) throw new Error(`Unsupported save version ${String(r.v)}`);
      this.rng = Rng.fromState(r.rngState);
      this._gold = r.gold;
      this._baseHp = r.baseHp;
      this._waveIndex = r.waveIndex;
      this._offers = [...r.offers];
      this._bench = r.bench;
      this._rerolls = r.rerolls;
      this.nextItemId = r.nextItemId;
      this.waveStats.push(...r.waveStats);
      for (const it of r.items) {
        const placed = this.backpack.place(
          { id: it.id, defId: it.defId, tier: it.tier, shape: it.shape },
          it.anchor,
          it.orientation,
        );
        if (!placed.ok) throw new Error(`Corrupt save: cannot place ${it.id} (${placed.reason})`);
      }
      return;
    }
    this.rng = new Rng(opts.seed);
    this._gold = this.modifiers.startingGold;
    this._baseHp = this.modifiers.baseHp;
    this.rollOffers();
  }

  /** Snapshot for saving. Only valid in the shop phase (the wave sim is not serialised). */
  toSave(): RunSave | undefined {
    if (this._phase !== "shop") return undefined;
    return {
      v: 1,
      seed: this.seed,
      rngState: this.rng.getState(),
      modifiers: this.modifiers,
      waveIndex: this._waveIndex,
      gold: this._gold,
      baseHp: this._baseHp,
      items: this.backpack.all(),
      bench: this._bench,
      offers: [...this._offers],
      rerolls: this._rerolls,
      nextItemId: this.nextItemId,
      waveStats: [...this.waveStats],
    };
  }

  static restore(save: RunSave, waves?: readonly WaveDef[]): Run {
    return new Run({
      seed: save.seed,
      modifiers: save.modifiers,
      restore: save,
      ...(waves ? { waves } : {}),
    });
  }

  // ------------------------------------------------------------ getters

  get phase(): RunPhase {
    return this._phase;
  }
  get gold(): number {
    return this._gold;
  }
  get baseHp(): number {
    return this._baseHp;
  }
  /** 1-based number of the wave being shopped for or fought. */
  get waveNumber(): number {
    return this.waves[this._waveIndex]?.id ?? this.waves.length;
  }
  get waveCount(): number {
    return this.waves.length;
  }
  get currentWave(): WaveDef | undefined {
    return this.waves[this._waveIndex];
  }
  get offers(): readonly (ShopOffer | null)[] {
    return this._offers;
  }
  get waveSim(): WaveSim | undefined {
    return this.sim;
  }
  get locked(): boolean {
    return this._phase !== "shop";
  }
  get bench(): BenchItem | null {
    return this._bench;
  }
  get rerollCost(): number {
    return REROLL_BASE_COST + this._rerolls;
  }

  // --------------------------------------------------------------- shop

  private rollOffers(): void {
    this._offers = [];
    for (let i = 0; i < SHOP_SIZE; i++) {
      const def = this.rng.pick(SHOP_ITEM_DEFS);
      this._offers.push({ defId: def.id, cost: def.cost });
    }
  }

  canAfford(index: number): boolean {
    const o = this._offers[index];
    return !!o && o.cost <= this._gold;
  }

  /** Re-roll all offers. Cost rises by one per reroll within the same shop. */
  reroll(): boolean {
    if (this.locked || this.rerollCost > this._gold) return false;
    this._gold -= this.rerollCost;
    this._rerolls++;
    this.rollOffers();
    return true;
  }

  private takeOffer(index: number): { def: ItemDef; id: string } | BuyResult {
    if (this.locked) return { ok: false, reason: "locked" };
    const offer = this._offers[index];
    if (!offer) return { ok: false, reason: "noOffer" };
    if (offer.cost > this._gold) return { ok: false, reason: "notEnoughGold" };
    return { def: itemDef(offer.defId), id: `${offer.defId}#${this.nextItemId}` };
  }

  private commitOffer(index: number): void {
    const offer = this._offers[index]!;
    this.nextItemId++;
    this._gold -= offer.cost;
    this._offers[index] = null;
  }

  /** Buy offer `index` and place it. Fails atomically. */
  buy(index: number, anchor: Cell, orientation: Orientation = 0): BuyResult {
    const taken = this.takeOffer(index);
    if ("ok" in taken) return taken;
    const res = this.backpack.place(
      { id: taken.id, defId: taken.def.id, tier: 1, shape: taken.def.shape },
      anchor,
      orientation,
    );
    if (!res.ok) return res;
    this.commitOffer(index);
    return { ok: true };
  }

  /** Buy an offer straight onto the bench. */
  buyToBench(index: number): BuyResult {
    if (this._bench) return { ok: false, reason: "benchFull" };
    const taken = this.takeOffer(index);
    if ("ok" in taken) return taken;
    this._bench = { id: taken.id, defId: taken.def.id, tier: 1 };
    this.commitOffer(index);
    return { ok: true };
  }

  /** Move a grid item to the empty bench. */
  toBench(itemId: string): BuyResult {
    if (this.locked) return { ok: false, reason: "locked" };
    if (this._bench) return { ok: false, reason: "benchFull" };
    const it = this.backpack.get(itemId);
    if (!it) return { ok: false, reason: "unknownItem" };
    this.backpack.remove(itemId);
    this._bench = { id: it.id, defId: it.defId, tier: it.tier };
    return { ok: true };
  }

  /** Place the bench item into the grid. */
  fromBench(anchor: Cell, orientation: Orientation = 0): BuyResult {
    if (this.locked) return { ok: false, reason: "locked" };
    const b = this._bench;
    if (!b) return { ok: false, reason: "benchEmpty" };
    const res = this.backpack.place(
      { id: b.id, defId: b.defId, tier: b.tier, shape: itemDef(b.defId).shape },
      anchor,
      orientation,
    );
    if (!res.ok) return res;
    this._bench = null;
    return { ok: true };
  }

  sellBench(): number | undefined {
    if (this.locked || !this._bench) return undefined;
    const price = Run.sellPrice(itemDef(this._bench.defId), this._bench.tier);
    this._bench = null;
    this._gold += price;
    return price;
  }

  /** Sell price: half the base cost, doubled per tier above 1, rounded down. */
  static sellPrice(def: ItemDef, tier: Tier): number {
    const mult = tier === 1 ? 1 : tier === 2 ? 2 : 4;
    return Math.floor((def.cost * mult) / 2);
  }

  sell(itemId: string): number | undefined {
    if (this.locked) return undefined;
    const it = this.backpack.remove(itemId);
    if (!it) return undefined;
    const price = Run.sellPrice(itemDef(it.defId), it.tier);
    this._gold += price;
    return price;
  }

  move(itemId: string, anchor: Cell, orientation?: Orientation): PlacementResult {
    if (this.locked) return { ok: false, reason: "unknownItem" };
    return this.backpack.move(itemId, anchor, orientation);
  }

  rotate(itemId: string): PlacementResult {
    if (this.locked) return { ok: false, reason: "unknownItem" };
    return this.backpack.rotate(itemId);
  }

  private sourceItem(src: DragSource): { defId: string; tier: Tier } | undefined {
    if (src.from === "grid") {
      const it = this.backpack.get(src.itemId);
      return it ? { defId: it.defId, tier: it.tier } : undefined;
    }
    if (src.from === "bench")
      return this._bench ? { defId: this._bench.defId, tier: this._bench.tier } : undefined;
    const offer = this._offers[src.index];
    return offer ? { defId: offer.defId, tier: 1 } : undefined;
  }

  /** Would dropping `src` onto grid item `targetId` merge or craft? */
  previewCombine(src: DragSource, targetId: string): CombinePreview | undefined {
    const target = this.backpack.get(targetId);
    const dragged = this.sourceItem(src);
    if (!target || !dragged) return undefined;
    if (src.from === "grid" && src.itemId === targetId) return undefined;
    if (canMerge(dragged, target))
      return { kind: "merge", resultDefId: target.defId, resultTier: mergedTier(target.tier) };
    const recipe = findRecipe(dragged.defId, target.defId);
    if (recipe) {
      // The result must fit where the target sits, in the target's orientation.
      const shape = itemDef(recipe.result).shape;
      if (this.backpack.canPlace(shape, target.orientation, target.anchor, targetId).ok) {
        return { kind: "craft", resultDefId: recipe.result, resultTier: 1 };
      }
    }
    return undefined;
  }

  /** Drop `src` onto grid item `targetId`. Consumes the source. Atomic. */
  combine(src: DragSource, targetId: string): CombineResult {
    if (this.locked) return { ok: false, reason: "locked" };
    const target = this.backpack.get(targetId);
    if (!target) return { ok: false, reason: "unknownItem" };
    const preview = this.previewCombine(src, targetId);
    if (!preview) {
      const dragged = this.sourceItem(src);
      if (dragged && findRecipe(dragged.defId, target.defId))
        return { ok: false, reason: "doesNotFit" };
      return { ok: false, reason: "noCombine" };
    }
    // Pay for / take the source first, checking affordability.
    if (src.from === "offer") {
      const offer = this._offers[src.index];
      if (!offer) return { ok: false, reason: "noOffer" };
      if (offer.cost > this._gold) return { ok: false, reason: "notEnoughGold" };
      this._gold -= offer.cost;
      this._offers[src.index] = null;
    } else if (src.from === "bench") {
      if (!this._bench) return { ok: false, reason: "benchEmpty" };
      this._bench = null;
    } else {
      this.backpack.remove(src.itemId);
    }
    // Replace the target in place.
    this.backpack.remove(targetId);
    const resultId =
      preview.kind === "merge" ? targetId : `${preview.resultDefId}#${this.nextItemId++}`;
    const placed = this.backpack.place(
      {
        id: resultId,
        defId: preview.resultDefId,
        tier: preview.resultTier,
        shape: itemDef(preview.resultDefId).shape,
      },
      target.anchor,
      target.orientation,
    );
    if (!placed.ok)
      throw new Error(`combine: result did not fit after preview said it would (${placed.reason})`);
    return { ok: true, kind: preview.kind, resultId };
  }

  // --------------------------------------------------------------- ability

  /** Volley: every weapon covering `lane` fires now at +50% damage. */
  useAbility(lane: number): boolean {
    if (this._phase !== "wave" || !this.sim) return false;
    const events = this.sim.useVolley(lane).map((ev) => ({ tick: this.sim!.tick, ev }));
    this.waveEvents.push(...events);
    for (const { ev } of events) if (ev.t === "goldEarned") this._gold += ev.amount;
    return events.length > 0;
  }

  get abilityCooldown(): number {
    return this.sim?.volleyCooldown ?? 0;
  }

  // --------------------------------------------------------------- wave

  startWave(): WaveSim | undefined {
    if (this._phase !== "shop") return undefined;
    const wave = this.waves[this._waveIndex];
    if (!wave) return undefined;
    this.sim = new WaveSim({
      backpack: this.backpack,
      wave,
      rng: this.rng,
      modifiers: this.modifiers,
      baseHp: this._baseHp,
    });
    this.waveEvents = [];
    this._phase = "wave";
    return this.sim;
  }

  /** Advance the wave by one tick. Returns that tick's events (tagged). */
  stepWave(): TaggedEvent[] {
    if (this._phase !== "wave" || !this.sim) return [];
    const tick = this.sim.tick;
    const events = this.sim.step().map((ev) => ({ tick, ev }));
    this.waveEvents.push(...events);
    for (const { ev } of events) {
      if (ev.t === "goldEarned") this._gold += ev.amount;
      if (ev.t === "waveEnded") this.finishWave(ev);
    }
    return events;
  }

  private finishWave(ended: Extract<SimEvent, { t: "waveEnded" }>): void {
    this._baseHp = ended.baseHp;
    // Economy items pay out at wave end, credited to the item.
    if (ended.result === "cleared") {
      for (const it of this.backpack.all()) {
        for (const e of tierData(itemDef(it.defId), it.tier).effects) {
          if (e.kind === "goldPerWave") {
            this._gold += e.amount;
            this.waveEvents.push({
              tick: ended.ticks,
              ev: {
                t: "goldEarned",
                amount: e.amount,
                source: { kind: "item", itemId: it.id, via: "shot" },
              },
            });
          }
        }
      }
    }
    this.waveStats.push(reduceWave(this.waveEvents));
    this.sim = undefined;
    if (ended.result === "baseDestroyed") {
      this._phase = "lost";
    } else if (this._waveIndex + 1 >= this.waves.length) {
      this._phase = "won";
    } else {
      this._waveIndex++;
      this._phase = "shop";
      this._rerolls = 0;
      this.rollOffers();
    }
  }

  /** Events of the wave in progress or the last finished wave. */
  get lastWaveEvents(): readonly TaggedEvent[] {
    return this.waveEvents;
  }
}
