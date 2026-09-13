import Phaser from "phaser";
import { CONTENT, ui } from "../../content/index.ts";
import { Run } from "../../sim/Run.ts";
import {
  browserStore,
  clearRun,
  historyEntry,
  loadRun,
  recordRun,
  saveRun,
  type KeyValueStore,
} from "../../save/storage.ts";
import { TICKS_PER_SECOND } from "../../sim/modifiers.ts";
import { BATTLE_H, COLORS, VIEW_W } from "../layout.ts";
import { VOLLEY_COOLDOWN } from "../../sim/combat/WaveSim.ts";
import { previewWave } from "../../sim/combat/waves.ts";
import { aggregate } from "../../sim/stats/aggregate.ts";
import { StatsAccumulator } from "../../sim/stats/RunStats.ts";
import { BackpackView } from "../views/BackpackView.ts";
import { BattleView } from "../views/BattleView.ts";
import { HudView } from "../views/HudView.ts";
import { MeterView } from "../views/MeterView.ts";
import { PreviewView } from "../views/PreviewView.ts";
import { ShopView } from "../views/ShopView.ts";

const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Owns the Run, drives sim ticks, fans events to the views. */
export class RunScene extends Phaser.Scene {
  private run!: Run;
  private battle!: BattleView;
  private bag!: BackpackView;
  private shop!: ShopView;
  private hud!: HudView;
  private preview!: PreviewView;
  private meter!: MeterView;
  private live: StatsAccumulator | undefined;
  private readonly store: KeyValueStore = browserStore();
  private acc = 0;
  private banner: Phaser.GameObjects.Container | undefined;

  constructor() {
    super("run");
  }

  create(data?: { seed?: number }): void {
    // Resume a saved run unless a seed was asked for explicitly (URL or Run again).
    const urlSeed = this.registry.get("seed") as number | undefined;
    const explicit = data?.seed ?? urlSeed;
    const saved = explicit === undefined ? loadRun(this.store) : undefined;
    if (saved) {
      try {
        this.run = Run.restore(saved);
      } catch {
        clearRun(this.store);
        this.run = new Run({ seed: Date.now() % 1_000_000 });
      }
    } else {
      this.run = new Run({ seed: explicit ?? Date.now() % 1_000_000 });
    }
    if (urlSeed !== undefined) this.registry.set("seed", undefined); // only the first run uses the URL seed
    this.acc = 0;

    this.battle = new BattleView(this, this.run.backpack);
    this.bag = new BackpackView(this, this.run, {
      onHover: (lanes, sellHover) => {
        if (lanes) this.battle.showLaneHints(lanes);
        else this.battle.clearLaneHints();
        this.shop.showSellHint(sellHover);
      },
      onChanged: () => this.refresh(),
    });
    this.shop = new ShopView(
      this,
      this.run,
      this.bag,
      () => this.refresh(),
      () => this.startWave(),
    );
    this.hud = new HudView(this, this.run, () => this.newRun());
    this.preview = new PreviewView(this);
    this.meter = new MeterView(this, this.run.backpack);
    this.refresh();
    this.showShopOverlays();
  }

  /** During the shop phase the battlefield shows next wave + last wave's meter. */
  private showShopOverlays(): void {
    const wave = this.run.currentWave;
    this.preview.show(wave ? previewWave(wave) : undefined);
    this.meter.showSummary(this.run.waveStats.at(-1));
  }

  private refresh(): void {
    this.bag.sync();
    this.shop.sync();
    this.hud.sync();
    this.persist();
  }

  /** Save in the shop phase; nothing is ever saved mid-wave. */
  private persist(): void {
    const save = this.run.toSave();
    if (save) saveRun(this.store, save);
  }

  private endRun(): void {
    const result = this.run.phase === "won" ? "won" : "lost";
    recordRun(
      this.store,
      historyEntry(this.run.seed, result, aggregate(this.run.waveStats), new Date()),
    );
    clearRun(this.store);
  }

  /** Abandon the current run and start a fresh one. */
  newRun(): void {
    clearRun(this.store);
    this.scene.restart({ seed: (this.run.seed + 7919) % 1_000_000 });
  }

  private startWave(): void {
    if (!this.run.startWave()) return;
    this.battle.reset();
    this.bag.setLocked(true);
    this.shop.setLocked(true);
    this.preview.hide();
    this.meter.clear();
    this.live = new StatsAccumulator(this.run.waveNumber);
    this.acc = 0;
    this.battle.setLaneTapHandler((lane) => {
      const before = this.run.lastWaveEvents.length;
      if (!this.run.useAbility(lane)) return;
      const events = this.run.lastWaveEvents.slice(before);
      this.battle.play(events.map((e) => e.ev));
      this.live?.pushAll(events);
      this.battle.sync(this.run.waveSim?.snapshot());
      this.hud.sync();
    });
  }

  override update(_time: number, delta: number): void {
    if (this.run.phase !== "wave") return;
    this.acc += delta * this.hud.speed;
    let guard = 0;
    while (this.acc >= TICK_MS && this.run.phase === "wave" && guard++ < 10) {
      this.acc -= TICK_MS;
      const events = this.run.stepWave();
      const snap = this.run.waveSim?.snapshot();
      this.battle.rememberTypes(snap);
      this.battle.play(events.map((e) => e.ev));
      this.battle.sync(snap);
      this.hud.sync();
      if (this.live) {
        this.live.pushAll(events);
        this.meter.showLive(this.live.stats);
        this.meter.showBoss(snap);
      }
      this.battle.showAbility(
        this.run.abilityCooldown,
        VOLLEY_COOLDOWN,
        ui(CONTENT, "volleyReady"),
      );
      if (this.run.phase !== "wave") this.onWaveOver();
    }
  }

  private onWaveOver(): void {
    this.battle.sync(undefined);
    this.battle.hideAbility();
    this.battle.setLaneTapHandler(undefined);
    this.meter.clear();
    this.live = undefined;
    const stats = this.run.waveStats.at(-1);
    const phase = this.run.phase;
    if (phase === "shop") {
      // Straight back to the shop: the meter and preview are the reveal.
      this.bag.setLocked(false);
      this.shop.setLocked(false);
      this.refresh();
      this.showShopOverlays();
      return;
    }
    this.endRun();
    const agg = aggregate(this.run.waveStats);
    const title = phase === "won" ? ui(CONTENT, "victory") : ui(CONTENT, "defeat");
    const sub = `${agg.wavesCleared}/${this.run.waveCount} ${ui(CONTENT, "wavesCleared")} · ${agg.enemiesKilled} ${ui(CONTENT, "kills")} · ${agg.totalGold}g`;
    void stats;
    this.showBanner(title, sub, true);
  }

  private showBanner(title: string, sub: string, withRestart: boolean): void {
    this.hideBanner();
    const bg = this.add
      .rectangle(VIEW_W / 2, BATTLE_H / 2, VIEW_W - 40, withRestart ? 120 : 84, COLORS.bg, 0.92)
      .setStrokeStyle(2, COLORS.accent);
    const t = this.add
      .text(VIEW_W / 2, BATTLE_H / 2 - (withRestart ? 34 : 16), title, {
        fontFamily: "monospace",
        fontSize: "20px",
        color: COLORS.text,
      })
      .setOrigin(0.5);
    const s = this.add
      .text(VIEW_W / 2, BATTLE_H / 2 + (withRestart ? -6 : 14), sub, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: COLORS.muted,
      })
      .setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [bg, t, s];
    if (withRestart) {
      // One tap from "run over" to a fresh run (docs/PLAN.md §1.5).
      const btn = this.add
        .text(VIEW_W / 2, BATTLE_H / 2 + 34, ui(CONTENT, "runAgain").toUpperCase(), {
          fontFamily: "monospace",
          fontSize: "14px",
          color: COLORS.text,
          backgroundColor: "#3a86ff",
          padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerup", () => this.scene.restart({ seed: (this.run.seed + 1) % 1_000_000 }));
      children.push(btn);
    }
    this.banner = this.add.container(0, 0, children).setDepth(20);
  }

  private hideBanner(): void {
    this.banner?.destroy();
    this.banner = undefined;
  }
}
