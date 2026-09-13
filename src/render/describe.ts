/**
 * Human-readable mechanics for the item info panel, derived from the item
 * data so it can never disagree with the sim. Labels come from the content
 * pack; numbers come from defs.
 */
import { CONTENT, itemText, ui } from "../content/index.ts";
import { itemDef } from "../sim/items/defs.ts";
import { recipePartners, findRecipe } from "../sim/items/recipes.ts";
import { tierData, type Tier } from "../sim/items/types.ts";
import { TICKS_PER_SECOND } from "../sim/modifiers.ts";
import { Run } from "../sim/Run.ts";

export interface ItemInfo {
  readonly title: string;
  readonly subtitle: string;
  readonly lines: readonly string[];
  readonly recipes: readonly string[];
  readonly description: string;
}

const secs = (ticks: number) =>
  `${(ticks / TICKS_PER_SECOND).toFixed(ticks % TICKS_PER_SECOND === 0 ? 0 : 1)}s`;

export function describeItem(defId: string, tier: Tier): ItemInfo {
  const def = itemDef(defId);
  const td = tierData(def, tier);
  const text = itemText(CONTENT, defId);
  const lines: string[] = [];
  if (td.weapon) {
    const w = td.weapon;
    const dps = ((w.damage * TICKS_PER_SECOND) / w.cooldownTicks).toFixed(1);
    lines.push(
      `${w.damage} ${ui(CONTENT, "dmg")} / ${secs(w.cooldownTicks)}  (${dps} ${ui(CONTENT, "dps")})`,
    );
    if (w.splashRange) lines.push(`${ui(CONTENT, "splash")} ±${w.splashRange}`);
    if (w.pierce && w.pierce > 1)
      lines.push(`${ui(CONTENT, "pierces")} ${w.pierce >= 99 ? ui(CONTENT, "all") : w.pierce}`);
    if (w.ignoresArmor) lines.push(ui(CONTENT, "ignoresArmor"));
    lines.push(
      def.shape.length > 1 ? ui(CONTENT, "coversTwoLanesRotated") : ui(CONTENT, "coversOwnLane"),
    );
  }
  if (td.defensive) {
    const d = td.defensive;
    lines.push(`${ui(CONTENT, "blocks")} ${d.chargesPerWave} ${ui(CONTENT, "perWave")}`);
    if (d.retaliationDamage) lines.push(`${ui(CONTENT, "retaliates")} ${d.retaliationDamage}`);
    lines.push(ui(CONTENT, "topOfColumnOnly"));
  }
  for (const e of td.effects) {
    switch (e.kind) {
      case "buffAdjacent":
        lines.push(
          e.buff === "attackSpeedPct"
            ? `${ui(CONTENT, "adjacentWeapons")} +${e.amount}% ${ui(CONTENT, "attackSpeed")}`
            : e.buff === "flatDamage"
              ? `${ui(CONTENT, "adjacentWeapons")} +${e.amount} ${ui(CONTENT, "dmg")}${e.onlyClasses ? ` (${ui(CONTENT, "projectileOnly")})` : ""}`
              : `${ui(CONTENT, "adjacentWeapons")} ${ui(CONTENT, "reachLanes")} ±${e.amount}`,
        );
        break;
      case "statusOnHitAdjacent":
        lines.push(
          e.status === "slow"
            ? `${ui(CONTENT, "adjacentWeapons")} ${ui(CONTENT, "slowBy")} ${e.magnitude}% ${ui(CONTENT, "for")} ${secs(e.ticks)}`
            : `${ui(CONTENT, "adjacentWeapons")} ${ui(CONTENT, "burnFor")} ${e.magnitude}/${ui(CONTENT, "tick")} ${ui(CONTENT, "for")} ${secs(e.ticks)}`,
        );
        break;
      case "statusOnHit":
        lines.push(
          e.status === "slow"
            ? `${ui(CONTENT, "hitsSlow")} ${e.magnitude}% ${ui(CONTENT, "for")} ${secs(e.ticks)}`
            : `${ui(CONTENT, "hitsBurn")} ${e.magnitude}/${ui(CONTENT, "tick")} ${ui(CONTENT, "for")} ${secs(e.ticks)}`,
        );
        break;
      case "goldPerWave":
        lines.push(`+${e.amount} ${ui(CONTENT, "gold").toLowerCase()} ${ui(CONTENT, "perWave")}`);
        break;
      case "produceResource":
        break;
    }
  }
  const recipes = recipePartners(defId).map((p) => {
    const r = findRecipe(defId, p)!;
    return `+ ${itemText(CONTENT, p).name} → ${itemText(CONTENT, r.result).name}`;
  });
  const stars = tier > 1 ? ` ${"★".repeat(tier - 1)}` : "";
  const cls = ui(CONTENT, `class_${def.itemClass}`);
  const sell = Run.sellPrice(def, tier);
  return {
    title: `${text.name}${stars}`,
    subtitle: `${cls} · ${def.cost}g · ${ui(CONTENT, "sellsFor")} ${sell}g`,
    lines,
    recipes,
    description: text.description,
  };
}
