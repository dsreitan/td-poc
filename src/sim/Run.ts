/**
 * A run: shop -> wave -> shop -> ... -> won | lost. Pure state machine over
 * the backpack, the shop and one WaveSim at a time. The renderer calls
 * these methods and animates the events. docs/PLAN.md §2.4.
 */
import { WaveSim } from "./combat/WaveSim.ts";
import { WAVES, type WaveDef } from "./combat/waves.ts";
import type { SimEvent, TaggedEvent } from "./events.ts";
import { Backpack, type PlacementResult } from "./grid/Backpack.ts";
import type { Cell, Orientation } from "./grid/shapes.ts";
import { itemDef, SHOP_ITEM_DEFS } from "./items/defs.ts";
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
  | { readonly ok: false; readonly reason: "notEnoughGold" | "noOffer" | "locked" };

export const SHOP_SIZE = 4;

export interface RunOptions {
  readonly seed: number;
  readonly modifiers?: RunModifiers;
  readonly waves?: readonly WaveDef[];
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
  private nextItemId = 1;
  private sim: WaveSim | undefined;
  private waveEvents: TaggedEvent[] = [];

  constructor(opts: RunOptions) {
    this.seed = opts.seed;
    this.modifiers = opts.modifiers ?? DEFAULT_MODIFIERS;
    this.waves = opts.waves ?? WAVES;
    this.rng = new Rng(opts.seed);
    this._gold = this.modifiers.startingGold;
    this._baseHp = this.modifiers.baseHp;
    this.rollOffers();
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

  /** Buy offer `index` and place it. Fails atomically. */
  buy(index: number, anchor: Cell, orientation: Orientation = 0): BuyResult {
    if (this.locked) return { ok: false, reason: "locked" };
    const offer = this._offers[index];
    if (!offer) return { ok: false, reason: "noOffer" };
    if (offer.cost > this._gold) return { ok: false, reason: "notEnoughGold" };
    const def = itemDef(offer.defId);
    const id = `${def.id}#${this.nextItemId}`;
    const res = this.backpack.place(
      { id, defId: def.id, tier: 1, shape: def.shape },
      anchor,
      orientation,
    );
    if (!res.ok) return res;
    this.nextItemId++;
    this._gold -= offer.cost;
    this._offers[index] = null;
    return { ok: true };
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
      this.rollOffers();
    }
  }

  /** Events of the wave in progress or the last finished wave. */
  get lastWaveEvents(): readonly TaggedEvent[] {
    return this.waveEvents;
  }
}
