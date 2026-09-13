import Phaser from "phaser";
import { CONTENT, enemyText, itemText, ui } from "../../content/index.ts";
import type { WaveSnapshot } from "../../sim/combat/WaveSim.ts";
import { enemyDef } from "../../sim/combat/enemies.ts";
import type { Backpack } from "../../sim/grid/Backpack.ts";
import type { SourceStats, WaveStats } from "../../sim/stats/RunStats.ts";
import { COLORS, HUD_H, ITEM_CLASS_COLORS, METER_H, METER_Y, VIEW_W } from "../layout.ts";
import { itemDef } from "../../sim/items/defs.ts";

const ROW_H = 18;

/**
 * Damage meter (Backpack Battles-style) fed by the stats fold: the same
 * renderer draws the live meter during a wave and the post-wave summary
 * in the shop. Also the boss HP bar. docs/PLAN.md §3.7.
 */
export class MeterView {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly bossRoot: Phaser.GameObjects.Container;
  private readonly backpack: Backpack;

  constructor(scene: Phaser.Scene, backpack: Backpack) {
    this.scene = scene;
    this.backpack = backpack;
    this.root = scene.add.container(0, 0).setDepth(7);
    this.bossRoot = scene.add.container(0, 0).setDepth(7);
  }

  private label(s: SourceStats): string {
    if (s.source.kind === "item") {
      const it = this.backpack.get(s.source.itemId);
      const defId = it?.defId ?? s.source.itemId.split("#")[0]!;
      return itemText(CONTENT, defId).name;
    }
    if (s.source.kind === "boss") return ui(CONTENT, "boss");
    return ui(CONTENT, "wave");
  }

  private colorOf(s: SourceStats): number {
    if (s.source.kind !== "item") return COLORS.gold;
    const it = this.backpack.get(s.source.itemId);
    const defId = it?.defId ?? s.source.itemId.split("#")[0]!;
    return ITEM_CLASS_COLORS[itemDef(defId).itemClass] ?? 0xffffff;
  }

  /** Rows: damage dealers by damage, then supports by what they granted. */
  private rows(
    stats: WaveStats,
    max: number,
  ): { label: string; value: number; text: string; color: number }[] {
    const all = Object.values(stats.sources).filter((s) => s.source.kind === "item");
    const dmg = all
      .filter((s) => s.totalDamage > 0)
      .sort((a, b) => b.totalDamage - a.totalDamage || a.key.localeCompare(b.key))
      .map((s) => ({
        label: this.label(s),
        value: s.totalDamage,
        text: `${s.totalDamage}`,
        color: this.colorOf(s),
      }));
    const support = all
      .filter(
        (s) =>
          s.totalDamage === 0 &&
          (s.buffsGranted.length > 0 ||
            s.statusesApplied.slow.count + s.statusesApplied.burn.count > 0 ||
            s.blocks > 0 ||
            s.gold > 0),
      )
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((s) => {
        const parts: string[] = [];
        if (s.statusesApplied.slow.count)
          parts.push(`${ui(CONTENT, "slowed")} ${s.statusesApplied.slow.count}`);
        if (s.statusesApplied.burn.count)
          parts.push(`${ui(CONTENT, "burned")} ${s.statusesApplied.burn.count}`);
        if (s.buffsGranted.length)
          parts.push(`${ui(CONTENT, "buffed")} ${new Set(s.buffsGranted.map((b) => b.to)).size}`);
        if (s.blocks) parts.push(`${ui(CONTENT, "blocked")} ${s.blocks}`);
        if (s.gold) parts.push(`+${s.gold}g`);
        return { label: this.label(s), value: 0, text: parts.join(" · "), color: this.colorOf(s) };
      });
    return [...dmg, ...support].slice(0, max);
  }

  /** Post-wave summary in the shop phase. */
  showSummary(stats: WaveStats | undefined): void {
    this.root.removeAll(true);
    if (!stats) return;
    const s = this.scene;
    const font = { fontFamily: "monospace", fontSize: "11px", color: COLORS.text };
    const head = `${ui(CONTENT, "wave")} ${stats.wave} · ${stats.enemiesKilled} ${ui(CONTENT, "kills")} · ${stats.baseDamage} ${ui(CONTENT, "baseDamage")} · +${stats.totalGold}g`;
    this.root.add(s.add.text(8, METER_Y, head, { ...font, color: COLORS.muted }));
    const rows = this.rows(stats, Math.floor((METER_H - 18) / ROW_H));
    const maxDmg = Math.max(1, ...rows.map((r) => r.value));
    rows.forEach((r, i) => {
      const y = METER_Y + 18 + i * ROW_H;
      if (r.value > 0) {
        const w = Math.max(2, (r.value / maxDmg) * (VIEW_W - 150));
        this.root.add(
          s.add.rectangle(120, y + ROW_H / 2, w, ROW_H - 6, r.color, 0.85).setOrigin(0, 0.5),
        );
      }
      this.root.add(s.add.text(8, y + ROW_H / 2, r.label, font).setOrigin(0, 0.5));
      this.root.add(
        s.add
          .text(124, y + ROW_H / 2, r.text, {
            ...font,
            color: r.value > 0 ? COLORS.textDark : COLORS.muted,
          })
          .setOrigin(0, 0.5),
      );
    });
  }

  /** Compact live meter in the top-left during a wave. */
  showLive(stats: WaveStats): void {
    this.root.removeAll(true);
    const s = this.scene;
    const rows = this.rows(stats, 3).filter((r) => r.value > 0);
    if (rows.length === 0) return;
    const maxDmg = Math.max(1, ...rows.map((r) => r.value));
    rows.forEach((r, i) => {
      const y = HUD_H + 4 + i * 14;
      const w = Math.max(2, (r.value / maxDmg) * 60);
      this.root.add(s.add.rectangle(4, y, w, 10, r.color, 0.7).setOrigin(0, 0));
      this.root.add(
        s.add
          .text(68, y + 5, `${r.label} ${r.text}`, {
            fontFamily: "monospace",
            fontSize: "9px",
            color: COLORS.muted,
          })
          .setOrigin(0, 0.5),
      );
    });
  }

  /** Boss HP bar with phase markers, shown while a boss is on the field. */
  showBoss(snap: WaveSnapshot | undefined): void {
    this.bossRoot.removeAll(true);
    const boss = snap?.enemies.find((e) => e.isBoss);
    if (!boss) return;
    const s = this.scene;
    const def = enemyDef(boss.type);
    const x = 100;
    const w = VIEW_W - x - 8;
    const y = HUD_H + 6;
    this.bossRoot.add(s.add.rectangle(x, y, w, 8, COLORS.hpBack).setOrigin(0, 0));
    this.bossRoot.add(
      s.add
        .rectangle(x, y, (w * boss.hp) / boss.maxHp, 8, boss.immune ? 0xffffff : COLORS.bad)
        .setOrigin(0, 0),
    );
    for (const ph of def.phases ?? []) {
      if (ph.trigger.kind === "hpBelowPct") {
        this.bossRoot.add(
          s.add
            .rectangle(x + (w * ph.trigger.value) / 100, y - 2, 2, 12, COLORS.gold)
            .setOrigin(0.5, 0),
        );
      }
    }
    this.bossRoot.add(
      s.add
        .text(
          x + w,
          y + 12,
          `${enemyText(CONTENT, boss.type).name} ${boss.hp}/${boss.maxHp}${boss.immune ? ` · ${ui(CONTENT, "shielded")}` : ""}`,
          {
            fontFamily: "monospace",
            fontSize: "9px",
            color: COLORS.muted,
          },
        )
        .setOrigin(1, 0),
    );
  }

  clear(): void {
    this.root.removeAll(true);
    this.bossRoot.removeAll(true);
  }
}
