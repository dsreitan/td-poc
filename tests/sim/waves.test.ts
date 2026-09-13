import { describe, expect, it } from "vite-plus/test";
import { enemyDef } from "../../src/sim/combat/enemies.ts";
import { expandSpawns, previewWave, WAVES, waveDef } from "../../src/sim/combat/waves.ts";

describe("waves", () => {
  it("defines consecutive ids starting at 1 with known enemies and lanes", () => {
    WAVES.forEach((w, i) => {
      expect(w.id).toBe(i + 1);
      for (const g of w.spawns) {
        expect(() => enemyDef(g.enemy)).not.toThrow();
        expect(g.lane).toBeGreaterThanOrEqual(0);
        expect(g.lane).toBeLessThan(4);
        expect(g.count).toBeGreaterThan(0);
      }
    });
    expect(() => waveDef(999)).toThrow();
  });

  it("preview is derived from the same data as the spawns", () => {
    for (const w of WAVES) {
      const p = previewWave(w);
      const spawns = expandSpawns(w);
      expect(p.total).toBe(spawns.length);
      for (const lane of p.lanes) {
        expect(lane.total).toBe(spawns.filter((s) => s.lane === lane.lane).length);
        for (const [enemy, n] of Object.entries(lane.counts)) {
          expect(n).toBe(spawns.filter((s) => s.lane === lane.lane && s.enemy === enemy).length);
        }
      }
      expect(p.lastSpawnTick).toBe(Math.max(...spawns.map((s) => s.tick)));
    }
  });

  it("expands spawns in tick order", () => {
    const spawns = expandSpawns(waveDef(2));
    for (let i = 1; i < spawns.length; i++)
      expect(spawns[i]!.tick).toBeGreaterThanOrEqual(spawns[i - 1]!.tick);
    expect(previewWave(waveDef(2)).enemyTypes).toEqual(["grunt", "runner"]);
  });

  it("wave 3 skews runners into lanes 2 and 3", () => {
    const p = previewWave(waveDef(3));
    expect(p.lanes[0]!.counts["runner"]).toBeUndefined();
    expect(p.lanes[1]!.counts["runner"]).toBeUndefined();
    expect(p.lanes[2]!.counts["runner"]).toBe(3);
    expect(p.lanes[3]!.counts["runner"]).toBe(3);
  });
});
