import Phaser from "phaser";
import { CONTENT, ui } from "../../content/index.ts";
import { Run } from "../../sim/Run.ts";
import { TICKS_PER_SECOND } from "../../sim/modifiers.ts";
import { BATTLE_H, COLORS, VIEW_W } from "../layout.ts";
import { BackpackView } from "../views/BackpackView.ts";
import { BattleView } from "../views/BattleView.ts";
import { HudView } from "../views/HudView.ts";
import { ShopView } from "../views/ShopView.ts";

const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Owns the Run, drives sim ticks, fans events to the views. */
export class RunScene extends Phaser.Scene {
  private run!: Run;
  private battle!: BattleView;
  private bag!: BackpackView;
  private shop!: ShopView;
  private hud!: HudView;
  private acc = 0;
  private banner: Phaser.GameObjects.Container | undefined;

  constructor() {
    super("run");
  }

  create(data?: { seed?: number }): void {
    const seed = data?.seed ?? Date.now() % 1_000_000;
    this.run = new Run({ seed });
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
    this.hud = new HudView(this, this.run);
    this.refresh();
  }

  private refresh(): void {
    this.bag.sync();
    this.shop.sync();
    this.hud.sync();
  }

  private startWave(): void {
    if (!this.run.startWave()) return;
    this.battle.reset();
    this.bag.setLocked(true);
    this.shop.setLocked(true);
    this.acc = 0;
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
      if (this.run.phase !== "wave") this.onWaveOver();
    }
  }

  private onWaveOver(): void {
    this.battle.sync(undefined);
    const stats = this.run.waveStats.at(-1);
    const phase = this.run.phase;
    const title =
      phase === "won"
        ? ui(CONTENT, "victory")
        : phase === "lost"
          ? ui(CONTENT, "defeat")
          : `${ui(CONTENT, "wave")} ${stats?.wave ?? ""} ✓`;
    const sub = stats
      ? `+${stats.totalGold} ${ui(CONTENT, "gold").toLowerCase()} · ${stats.enemiesKilled} kills · ${stats.baseDamage} base dmg`
      : "";
    this.showBanner(title, sub, phase === "won" || phase === "lost");
    if (phase === "shop") {
      this.time.delayedCall(1400, () => {
        this.hideBanner();
        this.bag.setLocked(false);
        this.shop.setLocked(false);
        this.refresh();
      });
    }
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
