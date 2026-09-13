/**
 * The single door through which anything outside a run (difficulty, future
 * meta-progression) enters the simulation. Replays are deterministic from
 * (seed, modifiers, decisions). docs/PLAN.md §1.4, §6.4.
 */
export interface RunModifiers {
  readonly baseHp: number;
  readonly startingGold: number;
  /** Ticks of initial cooldown added per grid row from the top (front row fires first). */
  readonly rowDelayTicks: number;
}

export const DEFAULT_MODIFIERS: RunModifiers = {
  baseHp: 20,
  startingGold: 10,
  rowDelayTicks: 3,
};

/** Simulation tick rate. All durations in the sim are in ticks. */
export const TICKS_PER_SECOND = 20;
/** Lane length in position units. Enemies spawn at LANE_LENGTH and breach at 0. */
export const LANE_LENGTH = 1000;
