/**
 * A deterministic "middling player" used by the balance bench. Not part of
 * the game. Each shop it buys what it can afford, merges when possible,
 * puts weapons where the preview says pressure is, supports next to
 * weapons, defenders in front of leaky lanes, economy at the back.
 */
import type { Run, RunPhase } from "./Run.ts";
import { LANES } from "./combat/constants.ts";
import { previewWave } from "./combat/waves.ts";
import type { Cell, Orientation } from "./grid/shapes.ts";
import { itemDef, SHOP_ITEM_DEFS } from "./items/defs.ts";
import { isWeapon } from "./items/types.ts";

export interface AutopilotResult {
  readonly seed: number;
  readonly phase: "won" | "lost";
  readonly waveReached: number;
  readonly baseHp: number;
  readonly gold: number;
  readonly bought: Record<string, number>;
}

function lanePressure(run: Run): number[] {
  const wave = run.currentWave;
  if (!wave) return Array.from({ length: LANES }, () => 0);
  const p = previewWave(wave);
  return p.lanes.map((l) => l.total + l.bossVisits.length * 5);
}

function weaponsPerLane(run: Run): number[] {
  const n = Array.from({ length: LANES }, () => 0);
  for (const it of run.backpack.all()) {
    if (!isWeapon(itemDef(it.defId))) continue;
    for (const c of run.backpack.coverage(it.id)) n[c]!++;
  }
  return n;
}

function firstFree(
  run: Run,
  col: number,
  shapeDefId: string,
  fromTop: boolean,
): { anchor: Cell; orientation: Orientation } | undefined {
  const shape = itemDef(shapeDefId).shape;
  const rows = fromTop ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
  for (const row of rows) {
    for (const o of [0, 1] as const) {
      if (run.backpack.canPlace(shape, o, { col, row }).ok)
        return { anchor: { col, row }, orientation: o };
    }
  }
  return undefined;
}

function adjacentToWeapon(
  run: Run,
  shapeDefId: string,
): { anchor: Cell; orientation: Orientation } | undefined {
  const shape = itemDef(shapeDefId).shape;
  const weaponCells = run.backpack
    .all()
    .filter((i) => isWeapon(itemDef(i.defId)))
    .flatMap((i) => run.backpack.cellsOf(i.id));
  const candidates: Cell[] = [];
  for (const c of weaponCells) {
    candidates.push(
      { col: c.col, row: c.row + 1 },
      { col: c.col - 1, row: c.row },
      { col: c.col + 1, row: c.row },
      { col: c.col, row: c.row - 1 },
    );
  }
  for (const cell of candidates) {
    if (run.backpack.canPlace(shape, 0, cell).ok) return { anchor: cell, orientation: 0 };
  }
  return undefined;
}

/** Run one shop phase of decisions. */
export function shopOnce(run: Run, bought: Record<string, number>): void {
  const pressure = lanePressure(run);
  // Cheapest first so more items land; weapons before supports so supports have neighbours.
  const order = run.offers
    .map((o, i) => ({ o, i }))
    .filter((x): x is { o: NonNullable<typeof x.o>; i: number } => x.o !== null)
    .sort((a, b) => {
      const wa = isWeapon(itemDef(a.o.defId)) ? 0 : 1;
      const wb = isWeapon(itemDef(b.o.defId)) ? 0 : 1;
      return wa - wb || a.o.cost - b.o.cost;
    });
  for (const { o, i } of order) {
    if (!run.canAfford(i)) continue;
    const def = itemDef(o.defId);
    // Merge if a same-def tier-1 or tier-2 item exists.
    const mergeTarget = run.backpack
      .all()
      .find((it) => run.previewCombine({ from: "offer", index: i }, it.id)?.kind === "merge");
    if (mergeTarget && run.combine({ from: "offer", index: i }, mergeTarget.id).ok) {
      bought[def.id] = (bought[def.id] ?? 0) + 1;
      continue;
    }
    let spot: { anchor: Cell; orientation: Orientation } | undefined;
    if (isWeapon(def)) {
      const have = weaponsPerLane(run);
      // Cover every lane first; then follow the preview's pressure.
      const lanes = [0, 1, 2, 3].sort(
        (a, b) =>
          (have[a]! > 0 ? 1 : 0) - (have[b]! > 0 ? 1 : 0) || pressure[b]! - pressure[a]! || a - b,
      );
      for (const lane of lanes) {
        spot = firstFree(run, lane, def.id, true);
        if (spot) break;
      }
    } else if (def.itemClass === "support") {
      spot = adjacentToWeapon(run, def.id);
    } else if (def.itemClass === "defensive") {
      const lanes = [0, 1, 2, 3].sort((a, b) => pressure[b]! - pressure[a]! || a - b);
      for (const lane of lanes) {
        spot = firstFree(run, lane, def.id, true);
        if (spot) break;
      }
    } else {
      for (let col = 0; col < LANES && !spot; col++) spot = firstFree(run, col, def.id, false);
    }
    if (spot && run.buy(i, spot.anchor, spot.orientation).ok)
      bought[def.id] = (bought[def.id] ?? 0) + 1;
  }
  // Spare gold and nothing bought this shop? Reroll once if cheap.
  if (run.gold >= run.rerollCost + 6 && run.offers.every((o) => o !== null)) run.reroll();
}

/** Lanes with no weapon covering them. */
function uncoveredLanes(run: Run): number[] {
  const have = weaponsPerLane(run);
  return [0, 1, 2, 3].filter((l) => have[l] === 0);
}

function affordableWeaponOffered(run: Run): boolean {
  return run.offers.some((o, i) => o !== null && run.canAfford(i) && isWeapon(itemDef(o.defId)));
}

export function autopilot(run: Run, maxWaves = 50): AutopilotResult {
  const bought: Record<string, number> = {};
  let guard = 0;
  while (run.phase === "shop" && guard++ < maxWaves) {
    // A middling player rerolls when a lane is open and the shop has no weapon.
    for (let i = 0; i < 3; i++) {
      if (
        uncoveredLanes(run).length > 0 &&
        !affordableWeaponOffered(run) &&
        run.gold >= run.rerollCost + 3
      )
        run.reroll();
      shopOnce(run, bought);
    }
    run.startWave();
    while ((run.phase as RunPhase) === "wave") {
      run.stepWave();
    }
  }
  return {
    seed: run.seed,
    phase: run.phase === "won" ? "won" : "lost",
    waveReached: run.phase === "won" ? run.waveCount : run.waveNumber,
    baseHp: run.baseHp,
    gold: run.gold,
    bought,
  };
}

export const ALL_SHOP_IDS = SHOP_ITEM_DEFS.map((d) => d.id);
