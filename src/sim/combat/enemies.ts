/** Enemy table. docs/PLAN.md §2.7, §2.8. Speed is lane units per tick. */

export type PhaseTrigger =
  | { readonly kind: "hpBelowPct"; readonly value: number }
  | { readonly kind: "positionBelow"; readonly value: number }
  | { readonly kind: "tick"; readonly value: number };

export type PhaseEffect =
  /** Immune to all damage for `ticks`. */
  | { readonly kind: "immune"; readonly ticks: number }
  | { readonly kind: "setArmor"; readonly value: number }
  /** Move to lane + offset (clamped, and reflected if off the edge). */
  | { readonly kind: "switchLane"; readonly offset: number }
  | { readonly kind: "setSpeed"; readonly value: number };

export interface BossPhase {
  readonly trigger: PhaseTrigger;
  readonly effects: readonly PhaseEffect[];
}

export interface EnemyDef {
  readonly id: string;
  readonly hp: number;
  readonly speed: number;
  /** Flat damage reduction per hit. Magic weapons ignore it. */
  readonly armor: number;
  readonly breachDamage: number;
  readonly gold: number;
  readonly isBoss?: boolean;
  /** Bosses cannot be bounced by defensive items; instead they strip charges. */
  readonly stripsCharges?: boolean;
  /** Phases fire once each, in order, when their trigger is met. */
  readonly phases?: readonly BossPhase[];
}

export const ENEMY_DEFS: readonly EnemyDef[] = [
  { id: "grunt", hp: 10, speed: 10, armor: 0, breachDamage: 1, gold: 1 },
  { id: "runner", hp: 5, speed: 22, armor: 0, breachDamage: 1, gold: 1 },
  { id: "armored", hp: 20, speed: 7, armor: 3, breachDamage: 2, gold: 2 },
  { id: "swarmling", hp: 3, speed: 14, armor: 0, breachDamage: 1, gold: 1 },
  {
    id: "warden",
    hp: 60,
    speed: 6,
    armor: 2,
    breachDamage: 4,
    gold: 10,
    isBoss: true,
    // Tests burst vs sustained: at half HP it shields for 3 s, then drops its armor.
    phases: [
      {
        trigger: { kind: "hpBelowPct", value: 50 },
        effects: [
          { kind: "immune", ticks: 60 },
          { kind: "setArmor", value: 0 },
        ],
      },
    ],
  },
  {
    id: "bulwark",
    hp: 150,
    speed: 5,
    armor: 5,
    breachDamage: 8,
    gold: 25,
    isBoss: true,
    stripsCharges: true,
    // Tests lane coverage: switches one lane over at the halfway mark.
    phases: [
      {
        trigger: { kind: "positionBelow", value: 500 },
        effects: [{ kind: "switchLane", offset: 1 }],
      },
    ],
  },
];

const BY_ID: ReadonlyMap<string, EnemyDef> = new Map(ENEMY_DEFS.map((d) => [d.id, d]));

export function enemyDef(id: string): EnemyDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown enemy def: ${id}`);
  return d;
}

/** Lanes an enemy may end up in if spawned in `lane` (for the preview). */
export function possibleLanes(def: EnemyDef, lane: number, laneCount: number): number[] {
  const lanes = new Set<number>([lane]);
  for (const p of def.phases ?? []) {
    for (const e of p.effects)
      if (e.kind === "switchLane") lanes.add(switchedLane(lane, e.offset, laneCount));
  }
  return [...lanes].sort((a, b) => a - b);
}

export function switchedLane(lane: number, offset: number, laneCount: number): number {
  let to = lane + offset;
  if (to >= laneCount) to = lane - offset;
  if (to < 0) to = lane + Math.abs(offset);
  return Math.max(0, Math.min(laneCount - 1, to));
}
