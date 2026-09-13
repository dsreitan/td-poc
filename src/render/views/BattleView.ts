import Phaser from "phaser";
import type { SimEvent } from "../../sim/events.ts";
import type { WaveSnapshot } from "../../sim/combat/WaveSim.ts";
import type { Backpack } from "../../sim/grid/Backpack.ts";
import {
  BASE_Y,
  BATTLE_H,
  BATTLE_Y,
  CELL,
  COLORS,
  ENEMY_COLORS,
  HUD_H,
  LANES,
  LANE_W,
  VIEW_W,
  cellToXY,
  laneCenterX,
  posToY,
} from "../layout.ts";

interface EnemySprite {
  body: Phaser.GameObjects.Rectangle;
  hp: Phaser.GameObjects.Rectangle;
  maxHp: number;
}

/** Lanes, enemies, projectiles, base line. Reads the sim snapshot every frame. */
export class BattleView {
  private readonly scene: Phaser.Scene;
  private readonly laneHints: Phaser.GameObjects.Rectangle[] = [];
  private readonly enemies = new Map<number, EnemySprite>();
  private readonly layer: Phaser.GameObjects.Container;
  private baseLine!: Phaser.GameObjects.Rectangle;
  private readonly backpack: Backpack;
  private readonly abilityBar: Phaser.GameObjects.Rectangle;
  private readonly abilityText: Phaser.GameObjects.Text;
  private onLaneTap: ((lane: number) => void) | undefined;

  constructor(scene: Phaser.Scene, backpack: Backpack) {
    this.scene = scene;
    this.backpack = backpack;
    scene.add.rectangle(0, BATTLE_Y, VIEW_W, BATTLE_H, COLORS.battle).setOrigin(0, 0);
    for (let i = 0; i < LANES; i++) {
      const hint = scene.add
        .rectangle(i * LANE_W, HUD_H, LANE_W, BATTLE_H - HUD_H, COLORS.laneHint, 0.12)
        .setOrigin(0, 0)
        .setVisible(false);
      this.laneHints.push(hint);
      if (i > 0)
        scene.add
          .rectangle(i * LANE_W, HUD_H, 1, BATTLE_H - HUD_H, COLORS.laneLine)
          .setOrigin(0, 0);
    }
    this.baseLine = scene.add.rectangle(0, BASE_Y, VIEW_W, 3, COLORS.accent).setOrigin(0, 0);
    this.layer = scene.add.container(0, 0);

    // Tap a lane during a wave to fire Volley there.
    const tapZone = scene.add
      .rectangle(0, HUD_H, VIEW_W, BATTLE_H - HUD_H, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive();
    tapZone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.onLaneTap?.(Math.max(0, Math.min(LANES - 1, Math.floor(pointer.x / LANE_W))));
    });
    this.abilityBar = scene.add
      .rectangle(0, BASE_Y - 4, VIEW_W, 2, COLORS.gold)
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(8);
    this.abilityText = scene.add
      .text(VIEW_W / 2, BASE_Y - 12, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ffc857",
      })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(8);
  }

  setLaneTapHandler(handler: ((lane: number) => void) | undefined): void {
    this.onLaneTap = handler;
  }

  /** Ability readiness: full gold line when ready, shrinking while on cooldown. */
  showAbility(cooldown: number, max: number, readyText: string): void {
    const ready = cooldown === 0;
    this.abilityBar.setVisible(true);
    this.abilityBar.width = ready ? VIEW_W : VIEW_W * (1 - cooldown / max);
    this.abilityBar.setFillStyle(ready ? COLORS.gold : COLORS.gridLine);
    this.abilityText.setVisible(ready).setText(readyText);
  }

  hideAbility(): void {
    this.abilityBar.setVisible(false);
    this.abilityText.setVisible(false);
  }

  /** Highlight lanes covered by the item being dragged. */
  showLaneHints(lanes: readonly number[]): void {
    this.laneHints.forEach((h, i) => h.setVisible(lanes.includes(i)));
  }

  clearLaneHints(): void {
    this.laneHints.forEach((h) => h.setVisible(false));
  }

  /** Sync enemy sprites to the snapshot. */
  sync(snap: WaveSnapshot | undefined): void {
    const seen = new Set<number>();
    if (snap) {
      for (const e of snap.enemies) {
        seen.add(e.id);
        let s = this.enemies.get(e.id);
        if (!s) {
          const size =
            e.type === "swarmling" ? 14 : e.type === "grunt" || e.type === "runner" ? 22 : 30;
          const body = this.scene.add.rectangle(0, 0, size, size, ENEMY_COLORS[e.type] ?? 0xffffff);
          const hp = this.scene.add.rectangle(0, 0, size, 3, COLORS.hp).setOrigin(0, 0.5);
          this.layer.add([body, hp]);
          s = { body, hp, maxHp: e.maxHp };
          this.enemies.set(e.id, s);
        }
        const x = laneCenterX(e.lane);
        const y = posToY(e.pos);
        s.body.setPosition(x, y);
        s.hp.setPosition(x - s.body.width / 2, y - s.body.height / 2 - 4);
        s.hp.width = Math.max(1, (s.body.width * e.hp) / s.maxHp);
      }
    }
    for (const [id, s] of this.enemies) {
      if (!seen.has(id)) {
        s.body.destroy();
        s.hp.destroy();
        this.enemies.delete(id);
      }
    }
  }

  /** Animate one tick's events. */
  play(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.t) {
        case "weaponFired":
          this.projectile(ev.itemId, ev.targetId, ev.lane);
          break;
        case "enemyDamaged": {
          const s = this.enemies.get(ev.id);
          if (s) {
            s.body.setFillStyle(0xffffff);
            this.scene.time.delayedCall(60, () => {
              if (s.body.active) s.body.setFillStyle(ENEMY_COLORS[this.typeOf(ev.id)] ?? 0xffffff);
            });
          }
          break;
        }
        case "enemyKilled": {
          const s = this.enemies.get(ev.id);
          if (s) {
            const pop = this.scene.add
              .rectangle(s.body.x, s.body.y, s.body.width, s.body.height, 0xffffff, 0.9)
              .setDepth(5);
            this.scene.tweens.add({
              targets: pop,
              scale: 1.8,
              alpha: 0,
              duration: 180,
              onComplete: () => pop.destroy(),
            });
          }
          break;
        }
        case "abilityUsed": {
          const flash = this.scene.add
            .rectangle(ev.lane * LANE_W, HUD_H, LANE_W, BATTLE_H - HUD_H, COLORS.gold, 0.35)
            .setOrigin(0, 0)
            .setDepth(4);
          this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 300,
            onComplete: () => flash.destroy(),
          });
          break;
        }
        case "breach": {
          const flash = this.scene.add
            .rectangle(
              ev.lane * LANE_W,
              HUD_H,
              LANE_W,
              BATTLE_H - HUD_H,
              ev.absorbedBy ? COLORS.ok : COLORS.bad,
              0.35,
            )
            .setOrigin(0, 0)
            .setDepth(4);
          this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 250,
            onComplete: () => flash.destroy(),
          });
          if (!ev.absorbedBy) this.scene.cameras.main.shake(120, 0.004);
          break;
        }
        default:
          break;
      }
    }
  }

  private typeMemo = new Map<number, string>();
  rememberTypes(snap: WaveSnapshot | undefined): void {
    if (!snap) return;
    for (const e of snap.enemies) this.typeMemo.set(e.id, e.type);
  }
  private typeOf(id: number): string {
    return this.typeMemo.get(id) ?? "grunt";
  }

  private projectile(itemId: string, targetId: number, lane: number): void {
    const cells = this.backpack.cellsOf(itemId);
    const top = cells[0];
    if (!top) return;
    const from = cellToXY(top.col, top.row);
    const target = this.enemies.get(targetId);
    const toX = target ? target.body.x : laneCenterX(lane);
    const toY = target ? target.body.y : posToY(500);
    const dot = this.scene.add.circle(from.x + CELL / 2, BASE_Y, 4, 0xffffff).setDepth(6);
    this.scene.tweens.add({
      targets: dot,
      x: toX,
      y: toY,
      duration: 110,
      ease: "Linear",
      onComplete: () => dot.destroy(),
    });
  }

  reset(): void {
    for (const s of this.enemies.values()) {
      s.body.destroy();
      s.hp.destroy();
    }
    this.enemies.clear();
    this.typeMemo.clear();
    this.clearLaneHints();
    this.hideAbility();
    void this.baseLine;
  }
}
