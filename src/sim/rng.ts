/**
 * Seeded PRNG (mulberry32). The only source of randomness in src/sim.
 * One instance per run, passed explicitly. Never use Math.random here.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform integer in [0, 2^32). */
  nextU32(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform integer in [0, n). */
  nextInt(n: number): number {
    if (n <= 0) throw new RangeError("nextInt: n must be positive");
    return this.nextU32() % n;
  }

  /** Uniform integer in [min, max] inclusive. */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** Pick an element. Throws on empty. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick: empty");
    return items[this.nextInt(items.length)]!;
  }

  /** Fisher–Yates shuffle, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const a = out[i]!;
      out[i] = out[j]!;
      out[j] = a;
    }
    return out;
  }

  /** Snapshot for saves. */
  getState(): number {
    return this.state;
  }

  static fromState(state: number): Rng {
    const r = new Rng(0);
    r.state = state >>> 0;
    return r;
  }
}
