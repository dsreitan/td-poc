/** Enemy table. docs/PLAN.md §2.7. Speed is lane units per tick. */
export interface EnemyDef {
  readonly id: string;
  readonly hp: number;
  readonly speed: number;
  /** Flat damage reduction per hit. Magic weapons ignore it. */
  readonly armor: number;
  readonly breachDamage: number;
  readonly gold: number;
  readonly isBoss?: boolean;
}

export const ENEMY_DEFS: readonly EnemyDef[] = [
  { id: "grunt", hp: 10, speed: 10, armor: 0, breachDamage: 1, gold: 1 },
  { id: "runner", hp: 5, speed: 22, armor: 0, breachDamage: 1, gold: 1 },
  { id: "armored", hp: 20, speed: 7, armor: 3, breachDamage: 2, gold: 2 },
  { id: "swarmling", hp: 3, speed: 14, armor: 0, breachDamage: 1, gold: 1 },
  { id: "warden", hp: 60, speed: 6, armor: 2, breachDamage: 4, gold: 10, isBoss: true },
  { id: "bulwark", hp: 150, speed: 5, armor: 5, breachDamage: 8, gold: 25, isBoss: true },
];

const BY_ID: ReadonlyMap<string, EnemyDef> = new Map(ENEMY_DEFS.map((d) => [d.id, d]));

export function enemyDef(id: string): EnemyDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown enemy def: ${id}`);
  return d;
}
