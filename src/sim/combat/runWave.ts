import type { TaggedEvent } from "../events.ts";
import { WaveSim, type WaveResult, type WaveSimOptions } from "./WaveSim.ts";

export interface WaveRun {
  readonly events: TaggedEvent[];
  readonly result: WaveResult;
  readonly ticks: number;
  readonly baseHp: number;
}

/** Headless: run a wave to completion. Safety cap prevents infinite loops. */
export function runWave(opts: WaveSimOptions, maxTicks = 20_000): WaveRun {
  const sim = new WaveSim(opts);
  const events: TaggedEvent[] = [];
  while (!sim.ended && sim.tick < maxTicks) {
    const tick = sim.tick;
    for (const ev of sim.step()) events.push({ tick, ev });
  }
  if (!sim.ended)
    throw new Error(`runWave: wave ${opts.wave.id} did not end within ${maxTicks} ticks`);
  return { events, result: sim.outcome!, ticks: sim.tick, baseHp: sim.currentBaseHp };
}
