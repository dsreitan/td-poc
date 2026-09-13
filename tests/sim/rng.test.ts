import { describe, expect, it } from "vite-plus/test";
import { Rng } from "../../src/sim/rng.ts";

describe("Rng", () => {
  it("is deterministic for a seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 10 }, () => a.nextU32());
    const seqB = Array.from({ length: 10 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it("nextInt stays in range and covers the range", () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect(() => r.nextInt(0)).toThrow(RangeError);
  });

  it("nextRange is inclusive", () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.nextRange(5, 8));
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
  });

  it("shuffle is a permutation and does not mutate input", () => {
    const r = new Rng(99);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it("state round-trips", () => {
    const r = new Rng(42);
    r.nextU32();
    const copy = Rng.fromState(r.getState());
    expect(copy.nextU32()).toBe(r.nextU32());
  });
});
