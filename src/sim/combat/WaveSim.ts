/**
 * One wave of combat. Fixed 20 Hz ticks, integer arithmetic, deterministic
 * iteration. Produces SimEvents; holds no presentation state.
 * Rules: docs/PLAN.md §2.2, §2.3.
 */
import type { Backpack, PlacedItem } from "../grid/Backpack.ts";
import type { SimEvent, Source } from "../events.ts";
import { itemDef } from "../items/defs.ts";
import {
  isWeapon,
  tierData,
  type ItemDef,
  type StatusKind,
  type WeaponStats,
} from "../items/types.ts";
import { DEFAULT_MODIFIERS, LANE_LENGTH, type RunModifiers } from "../modifiers.ts";
import type { Rng } from "../rng.ts";
import { deriveBuffs, sumBuff, type OnHitStatus } from "./buffs.ts";
import { LANES } from "./constants.ts";
import { enemyDef, switchedLane, type EnemyDef } from "./enemies.ts";
import { expandSpawns, type WaveDef } from "./waves.ts";

/** Ticks between Volley uses (15 s). */
export const VOLLEY_COOLDOWN = 300;

interface StatusState {
  ticks: number;
  magnitude: number;
  byItemId: string;
}

export interface EnemyState {
  readonly id: number;
  readonly def: EnemyDef;
  lane: number;
  pos: number;
  hp: number;
  /** Mutable copies so boss phases can change them. */
  armor: number;
  speed: number;
  immuneTicks: number;
  nextPhase: number;
  slow?: StatusState;
  burn?: StatusState;
}

interface WeaponState {
  readonly item: PlacedItem;
  readonly def: ItemDef;
  readonly stats: WeaponStats;
  /** Effective cooldown after attack-speed buffs. */
  readonly cooldownTicks: number;
  readonly columns: readonly number[];
  readonly onHit: readonly OnHitStatus[];
  cooldown: number;
}

interface DefenseState {
  readonly item: PlacedItem;
  charges: number;
  readonly retaliation: number;
}

export interface WaveSimOptions {
  readonly backpack: Backpack;
  readonly wave: WaveDef;
  readonly rng: Rng;
  readonly modifiers?: RunModifiers;
  /** Base HP entering this wave. Defaults to modifiers.baseHp. */
  readonly baseHp?: number;
}

export type WaveResult = "cleared" | "baseDestroyed";

/** Read-only view for the renderer. */
export interface WaveSnapshot {
  readonly tick: number;
  readonly baseHp: number;
  readonly enemies: readonly {
    id: number;
    type: string;
    lane: number;
    pos: number;
    hp: number;
    maxHp: number;
    immune: boolean;
    isBoss: boolean;
  }[];
  readonly weapons: readonly { itemId: string; cooldown: number; cooldownTicks: number }[];
  readonly defenses: readonly { itemId: string; charges: number }[];
  readonly remainingSpawns: number;
}

export class WaveSim {
  readonly wave: WaveDef;
  readonly modifiers: RunModifiers;
  private readonly bp: Backpack;
  // Reserved for future randomised mechanics; unused in M2 keeps replays trivially stable.
  private readonly _rng: Rng;

  private t = 0;
  private baseHp: number;
  private nextEnemyId = 1;
  private readonly spawns: readonly { tick: number; lane: number; enemy: string }[];
  private spawnIndex = 0;
  private readonly enemies: EnemyState[] = [];
  private readonly weapons: WeaponState[] = [];
  private readonly defenses = new Map<string, DefenseState>();
  private readonly startEvents: SimEvent[] = [];
  private result: WaveResult | undefined;
  private _volleyCooldown = 0;

  constructor(opts: WaveSimOptions) {
    this.bp = opts.backpack;
    this.wave = opts.wave;
    this._rng = opts.rng;
    this.modifiers = opts.modifiers ?? DEFAULT_MODIFIERS;
    this.baseHp = opts.baseHp ?? this.modifiers.baseHp;
    this.spawns = expandSpawns(opts.wave);

    const { byWeapon, events } = deriveBuffs(this.bp);
    this.startEvents.push({ t: "waveStarted", wave: opts.wave.id }, ...events);

    for (const item of this.bp.all()) {
      const def = itemDef(item.defId);
      const td = tierData(def, item.tier);
      if (isWeapon(def) && td.weapon) {
        const wb = byWeapon.get(item.id) ?? { buffs: [], onHit: [] };
        const flat = sumBuff(wb.buffs, "flatDamage");
        const speedPct = sumBuff(wb.buffs, "attackSpeedPct");
        const reach = sumBuff(wb.buffs, "laneReach");
        const base = this.bp.coverage(item.id);
        const cols = new Set<number>();
        for (const c of base) for (let d = -reach; d <= reach; d++) cols.add(c + d);
        const columns = [...cols].filter((c) => c >= 0 && c < LANES).sort((a, b) => a - b);
        const cooldownTicks = Math.max(
          1,
          Math.floor((td.weapon.cooldownTicks * 100) / (100 + speedPct)),
        );
        this.weapons.push({
          item,
          def,
          stats: { ...td.weapon, damage: td.weapon.damage + flat },
          cooldownTicks,
          columns,
          onHit: wb.onHit,
          cooldown: item.anchor.row * this.modifiers.rowDelayTicks,
        });
      }
      if (def.itemClass === "defensive" && td.defensive) {
        this.defenses.set(item.id, {
          item,
          charges: td.defensive.chargesPerWave,
          retaliation: td.defensive.retaliationDamage,
        });
      }
    }
    this.weapons.sort((a, b) => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  }

  get tick(): number {
    return this.t;
  }

  get ended(): boolean {
    return this.result !== undefined;
  }

  get outcome(): WaveResult | undefined {
    return this.result;
  }

  get currentBaseHp(): number {
    return this.baseHp;
  }

  get rng(): Rng {
    return this._rng;
  }

  /** Ticks until Volley is ready again. */
  get volleyCooldown(): number {
    return this._volleyCooldown;
  }

  snapshot(): WaveSnapshot {
    return {
      tick: this.t,
      baseHp: this.baseHp,
      enemies: this.enemies.map((e) => ({
        id: e.id,
        type: e.def.id,
        lane: e.lane,
        pos: e.pos,
        hp: e.hp,
        maxHp: e.def.hp,
        immune: e.immuneTicks > 0,
        isBoss: e.def.isBoss === true,
      })),
      weapons: this.weapons.map((w) => ({
        itemId: w.item.id,
        cooldown: w.cooldown,
        cooldownTicks: w.cooldownTicks,
      })),
      defenses: [...this.defenses.values()].map((d) => ({ itemId: d.item.id, charges: d.charges })),
      remainingSpawns: this.spawns.length - this.spawnIndex,
    };
  }

  /** Advance one tick. Returns the events of that tick. Empty once ended. */
  step(): SimEvent[] {
    if (this.result !== undefined) return [];
    const out: SimEvent[] = [];
    if (this.t === 0) out.push(...this.startEvents);

    this.spawn(out);
    this.fireWeapons(out);
    this.tickStatuses(out);
    this.tickPhases(out);
    this.moveEnemies(out);
    this.checkEnd(out);

    this.t++;
    return out;
  }

  // ------------------------------------------------------------- phases

  private spawn(out: SimEvent[]): void {
    while (this.spawnIndex < this.spawns.length && this.spawns[this.spawnIndex]!.tick <= this.t) {
      const s = this.spawns[this.spawnIndex++]!;
      const def = enemyDef(s.enemy);
      const e: EnemyState = {
        id: this.nextEnemyId++,
        def,
        lane: s.lane,
        pos: LANE_LENGTH,
        hp: def.hp,
        armor: def.armor,
        speed: def.speed,
        immuneTicks: 0,
        nextPhase: 0,
      };
      this.enemies.push(e);
      out.push({ t: "enemySpawned", id: e.id, type: def.id, lane: e.lane });
    }
  }

  private fireWeapons(out: SimEvent[]): void {
    for (const w of this.weapons) {
      if (w.cooldown > 0) {
        w.cooldown--;
        continue;
      }
      const target = this.frontmost(w.columns);
      if (!target) continue;
      w.cooldown = w.cooldownTicks;
      out.push({ t: "weaponFired", itemId: w.item.id, targetId: target.id, lane: target.lane });

      const src = (via: "shot" | "splash" | "pierce"): Source => ({
        kind: "item",
        itemId: w.item.id,
        via,
      });

      // Primary hit.
      this.hit(target, w, src("shot"), out);

      // Splash: same column, within range of the target's position.
      if (w.stats.splashRange && w.stats.splashRange > 0) {
        const range = w.stats.splashRange;
        for (const e of this.enemiesInLane(target.lane)) {
          if (e.id === target.id || e.hp <= 0) continue;
          if (Math.abs(e.pos - target.pos) <= range) this.hit(e, w, src("splash"), out);
        }
      }

      // Pierce: the next enemies behind the target in the same column.
      if (w.stats.pierce && w.stats.pierce > 1) {
        let left = w.stats.pierce - 1;
        for (const e of this.enemiesInLane(target.lane)) {
          if (left === 0) break;
          if (e.id === target.id || e.hp <= 0 || e.pos < target.pos) continue;
          this.hit(e, w, src("pierce"), out);
          left--;
        }
      }
      this.reap(out);
    }
  }

  private tickStatuses(out: SimEvent[]): void {
    if (this._volleyCooldown > 0) this._volleyCooldown--;
    for (const e of this.enemies) {
      if (e.immuneTicks > 0) e.immuneTicks--;
      if (e.burn) {
        this.damage(
          e,
          e.burn.magnitude,
          { kind: "item", itemId: e.burn.byItemId, via: "burn" },
          true,
          out,
        );
        if (--e.burn.ticks <= 0) {
          delete e.burn;
          out.push({ t: "statusExpired", id: e.id, status: "burn" });
        }
      }
      if (e.slow && --e.slow.ticks <= 0) {
        delete e.slow;
        out.push({ t: "statusExpired", id: e.id, status: "slow" });
      }
    }
    this.reap(out);
  }

  private moveEnemies(out: SimEvent[]): void {
    for (const e of this.enemies) {
      const speed = e.slow ? Math.floor((e.speed * (100 - e.slow.magnitude)) / 100) : e.speed;
      e.pos = Math.max(0, e.pos - speed);
      out.push({ t: "enemyMoved", id: e.id, pos: e.pos });
      if (e.pos === 0) this.breach(e, out);
    }
    // Remove everything that breached (hp set to 0 or flagged) and anything killed by retaliation.
    this.reap(out);
  }

  private breach(e: EnemyState, out: SimEvent[]): void {
    const top = this.bp.topItemInColumn(e.lane);
    const def = top ? this.defenses.get(top.id) : undefined;
    if (e.def.stripsCharges) {
      // A boss is never bounced. It tears the charges off every defensive
      // item covering its lane and hits the base anyway.
      for (const d of this.defenses.values()) {
        if (d.charges > 0 && this.bp.coverage(d.item.id).includes(e.lane)) {
          d.charges = 0;
          out.push({ t: "itemChargeUsed", itemId: d.item.id, remaining: 0 });
        }
      }
      this.baseHp = Math.max(0, this.baseHp - e.def.breachDamage);
      out.push({ t: "breach", id: e.id, lane: e.lane, baseDamage: e.def.breachDamage });
    } else if (top && def && def.charges > 0) {
      def.charges--;
      out.push({ t: "itemChargeUsed", itemId: top.id, remaining: def.charges });
      out.push({ t: "breach", id: e.id, lane: e.lane, absorbedBy: top.id, baseDamage: 0 });
      if (def.retaliation > 0 && e.hp > 0) {
        this.damage(
          e,
          def.retaliation,
          { kind: "item", itemId: top.id, via: "retaliation" },
          false,
          out,
        );
      }
    } else {
      this.baseHp = Math.max(0, this.baseHp - e.def.breachDamage);
      out.push({ t: "breach", id: e.id, lane: e.lane, baseDamage: e.def.breachDamage });
    }
    // A breaching enemy leaves the field either way ("bounced" or through).
    if (e.hp > 0) e.hp = -1; // negative marks removal without a kill
  }

  private checkEnd(out: SimEvent[]): void {
    if (this.baseHp <= 0) {
      this.result = "baseDestroyed";
    } else if (this.spawnIndex >= this.spawns.length && this.enemies.length === 0) {
      this.result = "cleared";
      out.push({ t: "goldEarned", amount: this.wave.clearBonus, source: { kind: "wave" } });
    }
    if (this.result) {
      out.push({ t: "waveEnded", result: this.result, ticks: this.t + 1, baseHp: this.baseHp });
    }
  }

  /**
   * Volley (hero ability): every weapon covering `lane` fires immediately at
   * +50% damage, ignoring its cooldown (which is then reset). One use per
   * VOLLEY_COOLDOWN ticks. Returns the events, empty if unavailable.
   */
  useVolley(lane: number): SimEvent[] {
    const out: SimEvent[] = [];
    if (this.result !== undefined || this._volleyCooldown > 0 || lane < 0 || lane >= LANES)
      return out;
    this._volleyCooldown = VOLLEY_COOLDOWN;
    out.push({ t: "abilityUsed", lane });
    for (const w of this.weapons) {
      if (!w.columns.includes(lane)) continue;
      const target = this.frontmost([lane]);
      if (!target) continue;
      w.cooldown = w.cooldownTicks;
      out.push({ t: "weaponFired", itemId: w.item.id, targetId: target.id, lane });
      const boosted: WeaponState = {
        ...w,
        stats: { ...w.stats, damage: Math.floor((w.stats.damage * 150) / 100) },
      };
      this.hit(target, boosted, { kind: "item", itemId: w.item.id, via: "shot" }, out);
    }
    this.reap(out);
    return out;
  }

  /** Fire boss phases whose trigger is met. One phase per enemy per tick. */
  private tickPhases(out: SimEvent[]): void {
    for (const e of this.enemies) {
      const phases = e.def.phases;
      if (!phases || e.nextPhase >= phases.length || e.hp <= 0) continue;
      const ph = phases[e.nextPhase]!;
      const tr = ph.trigger;
      const met =
        (tr.kind === "hpBelowPct" && e.hp * 100 < e.def.hp * tr.value) ||
        (tr.kind === "positionBelow" && e.pos < tr.value) ||
        (tr.kind === "tick" && this.t >= tr.value);
      if (!met) continue;
      const phase = e.nextPhase++;
      out.push({ t: "bossPhaseEntered", bossId: e.id, phase });
      for (const eff of ph.effects) {
        switch (eff.kind) {
          case "immune":
            e.immuneTicks = Math.max(e.immuneTicks, eff.ticks);
            break;
          case "setArmor":
            e.armor = eff.value;
            break;
          case "setSpeed":
            e.speed = eff.value;
            break;
          case "switchLane":
            e.lane = switchedLane(e.lane, eff.offset, LANES);
            break;
        }
      }
    }
  }

  // ------------------------------------------------------------ helpers

  private frontmost(columns: readonly number[]): EnemyState | undefined {
    let best: EnemyState | undefined;
    for (const e of this.enemies) {
      if (e.hp <= 0 || !columns.includes(e.lane)) continue;
      if (!best || e.pos < best.pos || (e.pos === best.pos && e.id < best.id)) best = e;
    }
    return best;
  }

  /** Enemies in a lane sorted by position ascending (front first), then id. */
  private enemiesInLane(lane: number): EnemyState[] {
    return this.enemies.filter((e) => e.lane === lane).sort((a, b) => a.pos - b.pos || a.id - b.id);
  }

  private hit(e: EnemyState, w: WeaponState, source: Source, out: SimEvent[]): void {
    this.damage(e, w.stats.damage, source, w.stats.ignoresArmor === true, out);
    if (e.hp > 0) {
      for (const s of w.onHit) this.applyStatus(e, s, out);
    }
  }

  private damage(
    e: EnemyState,
    raw: number,
    source: Source,
    ignoresArmor: boolean,
    out: SimEvent[],
  ): void {
    if (e.hp <= 0) return;
    if (e.immuneTicks > 0) {
      out.push({ t: "enemyDamaged", id: e.id, amount: 0, hp: e.hp, source, overkill: 0 });
      return;
    }
    const amount = ignoresArmor ? raw : Math.max(1, raw - e.armor);
    const before = e.hp;
    e.hp = before - amount;
    const overkill = e.hp < 0 ? -e.hp : 0;
    out.push({ t: "enemyDamaged", id: e.id, amount, hp: Math.max(0, e.hp), source, overkill });
    if (e.hp <= 0) {
      e.hp = 0;
      out.push({ t: "enemyKilled", id: e.id, source });
      if (e.def.gold > 0) out.push({ t: "goldEarned", amount: e.def.gold, source });
    }
  }

  private applyStatus(e: EnemyState, s: OnHitStatus, out: SimEvent[]): void {
    const key: "slow" | "burn" = s.status;
    const cur = e[key];
    // Strongest wins; equal strength refreshes duration.
    if (cur && cur.magnitude > s.magnitude) return;
    if (cur && cur.magnitude === s.magnitude && cur.ticks >= s.ticks) {
      cur.ticks = s.ticks; // refresh
    } else {
      e[key] = { ticks: s.ticks, magnitude: s.magnitude, byItemId: s.byItemId };
    }
    const status: StatusKind = s.status;
    out.push({
      t: "statusApplied",
      id: e.id,
      status,
      ticks: s.ticks,
      magnitude: s.magnitude,
      source: { kind: "item", itemId: s.byItemId, via: "status" },
    });
  }

  /** Remove dead (hp 0) and bounced/through (hp < 0) enemies. */
  private reap(_out: SimEvent[]): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i]!.hp <= 0) this.enemies.splice(i, 1);
    }
  }
}
