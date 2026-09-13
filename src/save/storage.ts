/**
 * Persistence: the current run (shop phase only) and a short run history.
 * Pure functions over an injected Storage so tests run without a browser.
 * Keys are versioned; an unreadable value is treated as absent, never thrown.
 * docs/PLAN.md §2.11, §6.4 (ProfileSave is the history for now).
 */
import type { RunSave } from "../sim/Run.ts";
import type { RunStats } from "../sim/stats/aggregate.ts";

export const RUN_KEY = "bb.run.v1";
export const HISTORY_KEY = "bb.history.v1";
export const HISTORY_MAX = 20;

/** Minimal Storage surface (localStorage, or a Map-backed fake in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RunHistoryEntry {
  readonly seed: number;
  readonly endedAt: string;
  readonly result: "won" | "lost";
  readonly wavesCleared: number;
  readonly wavesPlayed: number;
  readonly totalGold: number;
  readonly enemiesKilled: number;
  readonly baseDamage: number;
  /** Top damage source key and amount, for the history list. */
  readonly topSource?: { key: string; damage: number };
}

function read<T>(store: KeyValueStore, key: string): T | undefined {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadRun(store: KeyValueStore): RunSave | undefined {
  const save = read<RunSave>(store, RUN_KEY);
  return save && save.v === 1 ? save : undefined;
}

export function saveRun(store: KeyValueStore, save: RunSave): boolean {
  return write(store, RUN_KEY, save);
}

export function clearRun(store: KeyValueStore): void {
  try {
    store.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadHistory(store: KeyValueStore): RunHistoryEntry[] {
  const h = read<RunHistoryEntry[]>(store, HISTORY_KEY);
  return Array.isArray(h) ? h : [];
}

/** Prepend an entry, keep the newest HISTORY_MAX. */
export function recordRun(store: KeyValueStore, entry: RunHistoryEntry): RunHistoryEntry[] {
  const next = [entry, ...loadHistory(store)].slice(0, HISTORY_MAX);
  write(store, HISTORY_KEY, next);
  return next;
}

export function historyEntry(
  seed: number,
  result: "won" | "lost",
  stats: RunStats,
  now: Date,
): RunHistoryEntry {
  const top = Object.values(stats.sources)
    .filter((s) => s.totalDamage > 0)
    .sort((a, b) => b.totalDamage - a.totalDamage || a.key.localeCompare(b.key))[0];
  return {
    seed,
    endedAt: now.toISOString(),
    result,
    wavesCleared: stats.wavesCleared,
    wavesPlayed: stats.wavesPlayed,
    totalGold: stats.totalGold,
    enemiesKilled: stats.enemiesKilled,
    baseDamage: stats.baseDamage,
    ...(top ? { topSource: { key: top.key, damage: top.totalDamage } } : {}),
  };
}

/** A Map-backed store for tests and for environments where localStorage throws. */
export class MemoryStore implements KeyValueStore {
  private readonly m = new Map<string, string>();
  getItem(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
}

/** localStorage when usable, otherwise an in-memory fallback. */
export function browserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = "bb.probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStore();
  }
}
