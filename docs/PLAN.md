# Backpack Bastion — concept review and implementation plan

Status: proposal, pre-code. This document reviews the pitch, locks the design
decisions the prototype needs, and lays out milestones for a web POC.

---

## 1. Concept review

### 1.1 What is strong

**The backpack *is* the formation.** This is the idea. Every other
backpack/merge game has two disconnected loops (arrange inventory, then watch
auto-battle). Here, column position, item shape, rotation and adjacency all
have a direct tower-defense meaning. One decision surface, three kinds of
consequence. That is worth protecting above everything else in the list below.

**Pure simulation, Phaser renders events.** Right call, and it should be made
non-negotiable from commit one. It gives us:

- deterministic battles from `(seed, build, waveId)` for tests and replays,
- a headless balance harness (run 1,000 waves in a second),
- asynchronous PvP later with zero rework,
- the option to swap the renderer.

**Portrait split.** 40/60 works. The top 40% needs very little interaction
(one ability button, speed toggle), so all touch precision lives in the bottom
60% where thumbs are.

**Wave preview.** Correctly identified as essential. Without it, lane
positioning collapses into "spread damage evenly" and the spatial layer
becomes decoration. The preview is what makes the player *re-arrange* instead
of *optimise once*.

### 1.2 Risks and how the plan handles them

| Risk | Why it matters | Plan |
|---|---|---|
| **Waves are passive.** Backpack is locked, so the player watches for 20–30 s per wave, ten times. | Boredom in the phase that is supposed to be the payoff. | Keep waves short (20–35 s). Add a 2× speed toggle from day one. Hero ability is the only mid-wave input; make it lane-targeted so it also reads as a positional decision. Measure: do testers reach for speed-up immediately? If yes, waves need more to watch. |
| **Column lock makes layouts obvious.** With 4 lanes and 20 cells, "one weapon per column, supports in the gaps" may be the answer every time. | Kills the optimisation loop. | Wave preview varies lane pressure per wave. Make **rows** mean something too (see §2.3: breach hits the top item in that column; front row fires first). Two-cell items whose lane coverage depends on orientation. Coin purse and merge fodder compete for space. |
| **Three systems is a lot for a POC.** Merge + spatial + TD + crafting + factory flow. | Scope creep before the core is validated. | Milestone 3 is the *gate*: grid + drag + one wave with placeholder art. Merge, recipes, ability and save come after the gate. Factory flow is post-POC (see §1.3). |
| **Space is very tight.** 20 cells, 12 items, some 2-cell, plus merge needs duplicates parked somewhere. | Merging may feel impossible; or the grid may need to grow. | Merge happens on drop (drag same item onto same item), so fodder never has to sit in the grid. Shop shows one “bench” slot for holding one item between waves. Keep 4×5 for POC; grid size is a data constant. |
| **Determinism is easy to break.** Float drift, `Math.random`, iteration order, Phaser delta. | Replays and tests silently diverge. | Fixed tick (20 Hz). Seeded PRNG only, injected. Integer positions in 1/1000 lane units. Stable entity IDs and sorted iteration. A replay test in CI that hashes the event stream. |
| **Breach rules are undefined.** What happens when an enemy reaches row 0? | Defensive items are meaningless without it. | Locked in §2.3. |

### 1.3 On the factory angle

The "resources flow between connected items" idea is the strongest identity
hook in the pitch, and also the most expensive one. Recommendation: do **not**
implement flow in the POC, but make the simulation model *ready* for it:

- Adjacency is a first-class graph in the sim (`neighbours(itemId)`), not a
  per-item hack. Supports already work by adjacency, so this costs nothing.
- Items have typed *ports* in the data model (`provides: ['ammo']`,
  `consumes: ['ammo']`), even if the POC only has one provider (ammo pouch)
  and one consumer class (projectile weapons).
- Buffs are computed each tick from the graph, not baked in at placement.

If the gate passes, the first post-POC experiment is "heat": cannons generate
heat, adjacent frost flasks vent it, overheated cannons stall. That is a real
flow mechanic and it already uses two of the twelve items. The concrete
readiness work is in §3.8.

### 1.4 The one rule that keeps everything extensible

**Everything enters the simulation as data and leaves as events.** Item,
enemy, boss, status and wave definitions are tables. Meta-progression (if we
ever add it) enters through a single `RunModifiers` object. Every effect the
sim produces is an event with a `source` attribution. Nothing else crosses
the boundary.

That rule is what makes the later ideas (stats screens, factory flow, hero
XP, an RPG layer, PvP replays) additive instead of rewrites, and it costs
nothing now.

---

## 2. Design decisions locked for the POC

These are the things code will depend on. Changing them later is fine, but
they should not be *undecided* when we start.

### 2.1 Coordinates

- Virtual resolution **360 × 800**, scaled with `Phaser.Scale.FIT`, letterboxed.
- Battlefield: top 320 px. Backpack + shop: bottom 480 px.
- Four lanes, index `0..3`, left to right. Lane `x` corresponds to backpack
  column `x`.
- Backpack grid: 4 columns × 5 rows. Row `0` is the **top** row (closest to the
  enemies), row `4` is the bottom.
- Enemy position in a lane is an integer `0..1000` (1000 = spawn, 0 = the base
  line). No floats in the sim.

### 2.2 Time

- Sim runs at a fixed **20 ticks per second**. All durations, cooldowns and
  speeds are in ticks or lane-units-per-tick.
- Renderer interpolates between the last two sim states for smoothness, or just
  tweens on events. Renderer time never feeds back into the sim.
- 2× speed = renderer requests 2 ticks per frame. Same event stream.

### 2.3 Combat rules

- **Targeting:** a weapon targets the enemy with the lowest position (closest to
  base) among the columns it covers. Ties by lower entity id.
- **Coverage:** an item covers exactly the columns its cells occupy. A
  horizontal cannon covers two lanes; a vertical cannon covers one lane and
  occupies two rows. Rotation is therefore a real trade-off, not cosmetic.
- **Front row fires first:** items in a lower row index (closer to the top)
  get a small initial cooldown reduction, so there is a reason to put a weapon
  forward and a support behind it.
- **Breach:** when an enemy reaches position 0 in lane `x`, it strikes the
  **topmost item in column `x`**.
  - If that item is *defensive* with charges left, it absorbs the hit, loses a
    charge, and deals its retaliation damage to the enemy. The enemy is then
    removed (it "bounced").
  - Otherwise the base loses HP equal to the enemy's breach damage and the
    enemy is removed. Non-defensive items are not damaged in the POC (keeps
    the build stable and readable; revisit later).
- **Adjacency:** 4-neighbour, edge-sharing cells. Two items are adjacent if
  any cell of one touches any cell of the other. Supports buff all adjacent
  eligible items; buffs of the same kind stack additively, capped per item.
- **Slow:** multiplicative on speed, non-stacking (strongest wins), duration
  refreshes.
- **Splash:** cannon hits its target and every enemy within ±`splashRange`
  lane-units in the same column.

### 2.4 Run structure

```
Boot → Shop(wave 1 preview) → Wave 1 → Shop(wave 2 preview) → … → Wave 10 → Win
                                     ↘ base HP ≤ 0 → Lose
```

- Base HP: 20. No healing in the POC.
- Ten waves, 20–35 s each. Total run ~5 minutes including shopping.
- Between waves: gold income = kill gold + wave clear bonus + coin purse output.
- Shop: 4 offers, reroll cost `2 + rerollsThisShop`, sell at 50% of buy price
  (rounded down), tier-2 sells for 2× base, tier-3 for 4×.
- Shop offers a single **bench** slot outside the grid. One item may wait there
  during a wave. Everything else must be placed or sold before the wave starts.

### 2.5 Items (12 base, 3 tiers each)

Tier-up = drop an item onto an identical item of the same tier. Stats below
are tier 1; tiers 2/3 multiply damage or effect by roughly 1.7× and 3× and are
tuned in data, not code.

| # | Item | Shape | Class | Tier-1 effect |
|---|---|---|---|---|
| 1 | Crossbow | 1×1 | projectile weapon | 3 dmg, 1 shot / 15 ticks, one column |
| 2 | Cannon | 1×2 | projectile weapon | 8 dmg, 1 shot / 50 ticks, splash ±60, covers occupied columns |
| 3 | Flame lance | 1×1 | magic weapon | 1 dmg / 5 ticks continuous to front enemy, ignores armor |
| 4 | Ballista | 1×2 | projectile weapon | 12 dmg, 1 shot / 70 ticks, pierces (hits all in column up to 3) |
| 5 | Frost flask | 1×1 | support | adjacent weapons apply 30% slow for 30 ticks |
| 6 | Gearbox | 1×1 | support | adjacent weapons +25% attack speed |
| 7 | Ammunition pouch | 1×1 | support (provides `ammo`) | adjacent projectile weapons +2 dmg |
| 8 | Fire rune | 1×1 | support / reagent | adjacent weapons +1 burn dmg/tick for 20 ticks; also a recipe input |
| 9 | Spiked shield | 1×1 | defensive | 1 charge / wave, 6 retaliation dmg |
| 10 | Iron wall | 1×2 | defensive | 3 charges / wave, 0 retaliation |
| 11 | Coin purse | 1×1 | economy | +2 gold per wave |
| 12 | Lodestone | 1×1 | support | adjacent weapons may target enemies in ±1 adjacent lane (extends coverage) |

Lodestone is the deliberate "breaks the column rule" item. It is a valve for
the "layouts are obvious" risk and should be rare.

### 2.6 Recipes (3)

Crafting = drop item A onto item B where `(A, B)` matches a recipe. Result
takes B's position and shape if it fits, otherwise the craft is refused.

| Inputs | Result | Effect |
|---|---|---|
| Fire rune + Crossbow | **Flaming repeater** (1×1) | Crossbow fire rate ×1.5, shots apply burn |
| Frost flask + Cannon | **Glacier mortar** (1×2) | Cannon splash applies 50% slow |
| Ammunition pouch + Ballista | **Siege engine** (1×2) | Ballista pierces the whole column, +50% dmg |

### 2.7 Enemies (4 + 2 bosses)

| Enemy | HP | Speed (units/tick) | Armor | Breach dmg | Notes |
|---|---|---|---|---|---|
| Grunt | 10 | 10 | 0 | 1 | baseline |
| Runner | 5 | 22 | 0 | 1 | punishes slow weapons |
| Armored | 20 | 7 | 3 (flat reduction per hit) | 2 | punishes low-damage spam; magic ignores armor |
| Swarmling | 3 | 14 | 0 | 1 | spawns in groups of 5–8; rewards splash |
| **Warden** (mini-boss, wave 5) | 60 | 6 | 2 | 4 | shield phase at 50% HP, see §2.8 |
| **Bulwark** (boss, wave 10) | 150 | 5 | 5 | 8 | lane switch + charge strip, see §2.8 |

### 2.8 Boss levels

Bosses are the waves that *test a specific property of the layout* rather than
just scaling numbers. Each boss has a stated question and the preview makes
that question legible before the wave.

| Wave | Boss | Tests | Mechanic (data-driven phases) |
|---|---|---|---|
| 5 | **Warden** (mini-boss) | Burst vs sustained damage | 60 HP, armor 2. At 50% HP gains a shield: immune for 60 ticks, then armor drops to 0. Rewards weapons that hold fire or slows that buy time. |
| 10 | **Bulwark** | Lane coverage and defensive depth | 150 HP, armor 5. Switches lane once at position 500 (preview shows both lanes). Every breach it survives strips one charge from *every* defensive item in that column. |

Boss rules for the POC:

- Bosses come with an **escort** drawn from the normal enemy table, so single-
  target builds cannot ignore the escort and swarm builds cannot ignore the
  boss.
- Boss waves pay a **fixed bonus** on clear and unlock nothing (no permanent
  upgrades in the POC).
- A boss has `phases: BossPhase[]`, each `{ trigger: 'hpBelow' | 'position' |
  'tick', value, effects[] }`. Phase effects reuse the status/buff system, so a
  boss phase is just data that applies statuses to itself or to items.
- Boss HP bar and phase markers are rendered from `bossPhaseEntered` events.

Post-POC (see §6.5): a boss pool with 4–6 bosses and a random pick per run, plus
boss modifiers ("hasted", "shielded escort") for endless mode.

### 2.9 Waves

Waves are data: a list of `{ tick, lane, enemyType, count, spacingTicks }`.
The preview shown in the shop is derived from the same data (per-lane counts
by enemy type), so preview and reality cannot disagree.

Wave 1–3: grunts, then runners. Wave 4 introduces armored. Wave 5: Warden.
Wave 6 swarmlings. Wave 7–9 mix, with a deliberate lane skew each wave so the
player has a reason to move things. Wave 10: Bulwark + escort.

### 2.10 Hero ability (one)

**Volley:** tap a lane; every weapon covering that lane fires immediately with
+50% damage. Cooldown 300 ticks (15 s). Lane-targeted so it is still a spatial
decision, and it teaches coverage.

### 2.11 Save

Save the *shop state* between waves only (never mid-wave): run seed, wave
index, gold, base HP, grid contents, bench, shop offers, reroll count. One
`localStorage` key, JSON, versioned. Resume always lands in the shop.

---

## 3. Architecture

### 3.1 Module layout

```
src/
  sim/                      # pure TypeScript. MUST NOT import phaser.
    rng.ts                  # seeded PRNG (mulberry32), injected everywhere
    events.ts               # SimEvent discriminated union
    grid/
      Backpack.ts           # cells, placement, rotation, remove, adjacency graph
      shapes.ts             # shape → cell offsets, rotate()
    items/
      defs.ts               # ItemDef table (data), tiers, classes, ports
      recipes.ts            # craft(a, b) → ItemDef | null
      merge.ts              # tierUp(a, b) → ItemDef | null
    combat/
      WaveSim.ts            # tick(): enemies, weapons, projectiles, breaches
      targeting.ts
      effects.ts            # slow, burn, buffs from adjacency
      enemies.ts            # EnemyDef table
      waves.ts              # WaveDef table + preview(waveDef)
    economy/
      Shop.ts               # offers, reroll, buy, sell
    stats/
      RunStats.ts           # fold(events) → WaveStats; live + post-wave meter
      aggregate.ts          # WaveStats[] → RunStats
    Run.ts                  # state machine Shop ↔ Wave, win/lose, save DTO, RunModifiers input
  render/                   # Phaser 3. Consumes SimEvents, never mutates sim.
    Game.ts                 # Phaser.Game config, 360×800 FIT
    scenes/
      BootScene.ts
      RunScene.ts           # owns Run, drives ticks, fans events to views
    views/
      BattleView.ts         # lanes, enemies, projectiles, base HP
      BackpackView.ts       # grid, drag/drop, rotate, merge/craft drop feedback
      ShopView.ts           # offers, reroll, sell, wave preview, start button
      HudView.ts            # gold, wave, speed toggle, ability button, top-damage meter
      StatsView.ts          # post-wave / post-run stats from RunStats
    placeholder.ts          # coloured rects + text labels for everything
  save/
    localStorage.ts
  main.ts
tests/
  sim/**                    # vitest, imports only from src/sim
  replay.test.ts            # golden hash of event stream for a fixed seed+build
```

### 3.2 Boundary enforcement

- Oxlint `no-restricted-imports` (ESLint-compatible rule), scoped with an
  override to `src/sim/**`: may not import `phaser` or anything from
  `src/render/**`.
- A vitest test greps `src/sim` for the string `phaser` and fails if found.
  Cheap, unambiguous, and independent of linter config drift while Vite+ is
  pre-1.0.

### 3.3 Event stream

The sim exposes `tick(): SimEvent[]`. Renderer plays them. Sketch:

```ts
/** Who caused an effect. Every damage/status/gold event carries one. */
type Source =
  | { kind: 'item'; itemId: string; via?: 'shot' | 'splash' | 'burn' | 'pierce' | 'retaliation' }
  | { kind: 'ability'; ability: 'volley' }
  | { kind: 'boss'; bossId: number; phase: number }
  | { kind: 'wave' };                                        // clear bonus etc.

type SimEvent =
  | { t: 'waveStarted'; wave: number; tick: 0 }
  | { t: 'buffApplied'; itemId: string; byItemId: string; buff: BuffKind; amount: number }  // at wave start, from the adjacency graph
  | { t: 'enemySpawned'; id: number; type: EnemyType; lane: number }
  | { t: 'enemyMoved'; id: number; pos: number }             // once per tick per enemy
  | { t: 'weaponFired'; itemId: string; targetId: number; lane: number }
  | { t: 'enemyDamaged'; id: number; amount: number; hp: number; source: Source; overkill: number }
  | { t: 'enemyKilled'; id: number; source: Source }
  | { t: 'statusApplied'; id: number; status: StatusKind; ticks: number; source: Source }
  | { t: 'statusExpired'; id: number; status: StatusKind }
  | { t: 'goldEarned'; amount: number; source: Source }
  | { t: 'breach'; id: number; lane: number; absorbedBy?: string; baseDamage: number }
  | { t: 'itemChargeUsed'; itemId: string; remaining: number }
  | { t: 'abilityUsed'; lane: number }
  | { t: 'bossPhaseEntered'; bossId: number; phase: number }
  | { t: 'itemXpGained'; itemId: string; amount: number; source: Source }   // reserved, §6.1
  | { t: 'resourceTransferred'; from: string; to: string; resource: ResourceKind; amount: number } // reserved, §3.8
  | { t: 'waveEnded'; result: 'cleared' | 'baseDestroyed'; ticks: number }
```

Every tick's events are tagged with the tick number by the caller, so stats
can compute uptimes and timelines without the sim knowing about stats.

`enemyMoved` per tick is chatty but simple; if it becomes a problem the
renderer can read positions from a read-only snapshot instead. Decide at M3
based on profiling, not in advance.

### 3.4 Determinism checklist

- One PRNG instance per run, seeded from the run seed, passed explicitly.
- `Math.random` banned in `src/sim` via Oxlint `no-restricted-properties`.
- Entities stored in arrays, iterated in id order. No `Set`/`Map` iteration
  for anything that affects outcome.
- All arithmetic on integers. Percent buffs applied as `Math.floor(x * n / 100)`.
- Replay test: fixed seed + fixed build + default `RunModifiers` → hash of all
  events must match a committed golden value. Update the golden deliberately
  when rules change.

### 3.5 Toolchain: Vite+

We use **Vite+** (`vite-plus`, the `vp` CLI from VoidZero) as the single
toolchain instead of wiring Vite, Vitest, ESLint and Prettier separately.
Status at time of writing: 0.3.1 is the `latest` tag on npm (2026-09-08),
MIT-licensed, open source, still pre-1.0 beta.

What we get from one dependency and one `vite.config.ts`:

| Need | `vp` command | Underlying tool |
|---|---|---|
| Dev server, HMR | `vp dev` | Vite |
| Production build | `vp build` | Vite + Rolldown |
| Unit tests (sim rules) | `vp test` | Vitest |
| Lint, incl. the sim/render boundary | `vp lint` | Oxlint |
| Formatting | `vp fmt` | Oxfmt |
| Type checking | `vp check` | tsgo / tsc |
| Scripts, e.g. `sim:bench` | `vp run sim:bench` | Vite Task |
| Node + package manager pinning | `vp env` | built in |
| Pre-commit lint/format | `vp staged` + `vp hooks` | built in |

Other decisions:

- TypeScript strict. Phaser 3 latest 3.x.
- `vp run sim:bench` — headless script that runs N seeded runs with a given
  build and prints wave clear rates. This is the balance tool.
- Capacitor deferred until after the gate; nothing in the plan blocks it.
  Capacitor only needs the `dist/` output of `vp build`.

Pre-1.0 precautions (Vite+ has shipped renames and layout changes between
0.x minors, e.g. `VP_*` env vars in 0.2.8, `vp env setup` replacing corepack
in 0.3.1):

- Pin `vite-plus` to an exact version in `package.json`; bump deliberately,
  in its own commit, reading the release notes.
- Commit the `vp env` Node/package-manager pin so every machine and CI use
  the same runtime.
- Keep everything in one `vite.config.ts`; do not add standalone
  `vitest.config.ts` / `.oxlintrc.json` unless `vp migrate` or a release
  note requires it.
- Keep the grep-based boundary test (§3.2) so the architectural rule does
  not depend on linter configuration surviving an upgrade.
- If `vp` blocks us on something for more than an hour, the underlying
  tools are all standard: `npx vitest`, `npx oxlint`, `npx vite` work on the
  same config. Fall back, note it in the commit, move on.

### 3.6 Deployment: GitHub Pages on every push to `main`

The game is a static bundle (`vp build` → `dist/`), which is exactly what
GitHub Pages serves. The repo is public, so Pages is free. Every merge to
`main` publishes to `https://dsreitan.github.io/td-poc/` within about a
minute, and that URL is what we open on a phone to test.

Setup, once:

1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`. Pages serves the
   site under `/td-poc/`, so the workflow sets `VITE_BASE=/td-poc/`; local
   `vp dev` stays at `/`. A custom domain later just drops the env var.
3. Workflow `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx vp lint && npx vp check && npx vp test
      - run: npx vp build
        env: { VITE_BASE: /td-poc/ }
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Notes:

- Lint, typecheck and tests run in the same job, so a red build never
  deploys. A separate `ci.yml` runs the same checks on pull requests without
  the deploy step.
- Vite emits hashed asset filenames, so the Pages CDN cache (about ten
  minutes on `index.html`) is only ever a stale shell for a moment, never
  stale code. A hard refresh on the phone fixes it if it bites.
- Phaser has no server requirements. Save data is `localStorage`, which is
  per-origin, so a Pages deploy and a local dev server keep separate saves.
  Convenient for testing.
- `vp env` pins Node for developers; CI uses `setup-node` with the same
  major so both match. If `vp` needs its own install step in CI, the release
  notes say so and the fallback is `npx vite build`, same config.
- Add to home screen on Android gives a full-screen portrait test build
  without Capacitor. A minimal `manifest.webmanifest` (display: standalone,
  orientation: portrait) is a five-minute M0 addition and worth it.

What Pages does **not** give us: preview URLs per pull request. One site per
repo. If we want "try this branch on my phone" before merging, either deploy
branches to a subfolder (`/td-poc/pr-42/`) with a second workflow, or put the
same `dist/` on Cloudflare Pages or Netlify, both of which do PR previews for
free. Not needed for the POC; `main` is the test build.

### 3.7 Stats and telemetry (Backpack Battles-style)

The post-wave and post-run stats screens are a **pure fold over the event
stream**. No counters inside the combat sim, no second source of truth.

```
src/sim/stats/
  RunStats.ts      # reduce(events: TaggedEvent[]): WaveStats
  aggregate.ts     # WaveStats[] → RunStats
```

`WaveStats` per item (and per ability, per boss):

| Stat | Derived from |
|---|---|
| Damage dealt, split by `via` (shot / splash / burn / pierce / retaliation) | `enemyDamaged.source` |
| Kills, overkill wasted | `enemyKilled`, `enemyDamaged.overkill` |
| Shots fired, hit rate | `weaponFired`, `enemyDamaged` |
| Buffs **granted** (for supports): which items, which buff, how much | `buffApplied.byItemId` |
| Buffs **received** (for weapons) | `buffApplied.itemId` |
| Debuffs applied, total slow-ticks / burn-ticks inflicted | `statusApplied`, `statusExpired` |
| Blocks absorbed, retaliation damage | `breach.absorbedBy`, `itemChargeUsed` |
| Gold earned by source (kills, wave, coin purse) | `goldEarned` |
| Base damage taken per lane | `breach.baseDamage` |
| Lane pressure: enemies per lane, breaches per lane | `enemySpawned`, `breach` |

Design consequences that come for free:

- **Top damage meter** in the HUD during the wave: the same reducer runs
  incrementally on each tick's events. One code path for live and post-wave.
- **Credit for supports.** A frost flask does no damage, but its row shows
  "slowed 14 enemies for 420 ticks, buffed Crossbow ×2". That is what makes
  support items feel worth their cell.
- **Completeness pressure.** If a mechanic does not show up in stats, it is
  because the sim forgot to emit an event for it. The stats test suite is
  therefore also a test that the event stream is complete.
- **Balance harness output.** `sim:bench` prints `RunStats` aggregates across
  seeds: average damage share per item, which lanes breach most, which items
  are never bought. This is the tuning loop.

Post-run screen: damage share bar per item, best wave, gold curve, and the
final build. Persist `RunStats` summaries to local storage for a run history
list (cheap, and it is the seed of any later profile/RPG layer).

### 3.8 Factory-flow readiness (no flow in the POC)

What we build now so that resource flow is additive later:

- `ItemDef.ports?: { provides?: ResourceKind[]; consumes?: ResourceKind[] }`.
  POC: ammunition pouch `provides: ['ammo']`, projectile weapons
  `consumes: ['ammo']`. `ResourceKind = 'ammo' | 'heat' | 'mana'` with only
  `ammo` referenced anywhere.
- `Backpack.adjacencyGraph()` returns `{ nodes: itemId[], edges: [a, b][] }`.
  Computed once at wave start (the backpack is locked during a wave), cached
  on the `WaveSim`. Buffs are derived from this graph, emitted as
  `buffApplied` events, and stored on the weapon for the wave.
- Buff computation lives in one function: `deriveBuffs(graph, items) →
  Map<itemId, Buff[]>`. Flow later becomes a second pass over the same graph
  (`deriveFlow(graph, items) → transfers[]`) that emits `resourceTransferred`.
- The `resourceTransferred` event exists in the union now so stats and the
  renderer have a slot for it. Nothing emits it in the POC.
- `ItemDef.effects` are expressed as a list of typed effect records (`{ kind:
  'buffAdjacent', buff, amount }`, `{ kind: 'statusOnHit', status, ticks }`),
  not as bespoke code per item. Adding a `{ kind: 'produceResource' }` record
  later is a new case, not a new system.

Explicitly **not** doing now: any per-tick resource accounting, any UI for
flow, any "connected" vs "adjacent" distinction. If the gate passes and the
first flow experiment ("heat", §1.3) proves out, connection topology becomes
a real question and gets its own design pass.

---

## 4. Milestones

Each milestone ends in a runnable state and a commit. Estimates are rough
working-day counts for one developer.

### M0 — Scaffold (0.5 d)

- `npm create vite-plus` (vanilla TypeScript template), add Phaser 3, pin
  `vite-plus` exactly, `vp env` pin for Node. `vp dev` shows a 360×800
  letterboxed canvas with the two-panel split and a "hello" rect in each.
- Single `vite.config.ts` carrying test, lint and fmt config.
- CI runs `vp lint`, `vp check`, `vp test`, `vp build` on pull requests;
  the same plus deploy to GitHub Pages on push to `main` (§3.6). First
  deploy is the "hello" canvas, so the pipeline is proven before there is
  anything to test.
- `manifest.webmanifest` for add-to-home-screen portrait testing on Android.
- `src/sim` boundary rule in place in Oxlint, plus the grep test.
- `vp hooks` installs a pre-commit `vp staged` so lint/format never reach CI.

### M1 — Backpack simulation (1.5 d)

- `Backpack`: place/remove/move/rotate with validation, cell → item lookup,
  `neighbours(itemId)`.
- Shapes: 1×1 and 1×2 with rotation.
- Item defs table with the 12 items (stats can be placeholders).
- Tests: placement collisions, rotation at edges, adjacency symmetric,
  coverage columns per orientation.

### M2 — Combat simulation, one wave (2 d)

- `WaveSim` tick loop with enemies, movement, targeting, cooldowns,
  damage, kills, breach against base HP.
- Crossbow and Cannon fully working. Grunt and Runner.
- Wave defs + `preview()`.
- `Source` attribution on every damage/kill/gold event; `stats/RunStats.ts`
  reducer with tests (damage per item, kills, gold by source).
- Headless test: given build X and wave 1, the wave clears in N ticks with
  base HP Y. Replay hash test.
- `sim:bench` task skeleton, runnable with `vp run sim:bench`.

### M3 — Phaser prototype: **the gate** (3 d)

- BattleView renders lanes, enemies as rects, projectiles as dots, base HP.
- BackpackView: drag from bench/shop to grid, drag within grid, tap to
  rotate while dragging, invalid drop snaps back. Column highlight while
  dragging shows lane coverage.
- Start wave button; backpack locks; wave runs from the sim's events; 2×
  toggle.
- Fixed starting gold and a fixed 4-offer shop (no reroll yet) so the loop
  is: buy → place → fight → repeat for 3 waves.
- **Exit criterion:** with rectangles and no sound, does moving a crossbow
  one column left because the preview shows runners there *feel* like a
  decision? Two or three people outside the team play three waves. If the
  answer is no, stop and rethink §2.3 before building anything else.

### M4 — Full run loop and economy (2 d)

- Shop with reroll, sell, bench slot. Gold from kills, clears, coin purse.
- All 10 waves, win/lose screens, restart.
- Armored, Swarmling. Boss phase system as data; Warden (wave 5) and Bulwark
  (wave 10) with escorts; boss HP bar with phase markers.
- Wave preview panel in the shop, per lane, including boss lane path.
- Post-wave stats panel (damage meter, buffs granted/received, blocks) and
  post-run summary, both rendered from `RunStats`. Live top-damage meter in
  the HUD.

### M5 — All items and adjacency effects (2 d)

- Remaining weapons, all supports and buff computation from the adjacency
  graph (`deriveBuffs`, `buffApplied` events), defensive items and the breach
  rule, Lodestone coverage extension. `ItemDef.ports` populated for the
  ammunition pouch and projectile weapons.
- Stats extended with support credit (buffs granted, slow/burn ticks
  inflicted) and block stats.
- Tests for each support's effect on a neighbouring weapon, breach absorption
  order, slow non-stacking.

### M6 — Merge, recipes, ability (1.5 d)

- Tier-up on drop, three recipes, drop-target highlighting (green = merge,
  gold = craft, red = invalid).
- Volley ability with lane tap and cooldown.
- Tests: merge only same tier, craft refused if result shape does not fit.

### M7 — Save, tuning, polish (2 d)

- Save/resume in shop. Versioned DTO. Run history (last 20 `RunStats`
  summaries) in a separate storage key.
- Run `sim:bench` across a handful of reference builds; tune wave defs so a
  naive build loses around wave 6–7 and a thoughtful one clears wave 10 with
  base HP to spare. Use the stats aggregates to find dead items.
- Minimal feedback: hit flashes, damage numbers, breach shake. Still no art.

Total: roughly 15–16 working days to a complete, tunable POC, with a
go/no-go decision at day 7. The stats layer adds about a day across M2/M4/M5;
the boss phase system about half a day in M4.

---

## 5. Open questions to settle before M3

1. **Should a breach damage a non-defensive item?** Deferred to "no" in the
   POC. It would make defensive items much more important but adds a repair
   economy. Revisit after the gate.
2. **Does the bench slot survive a wave?** Proposed yes (one item). If it
   trivialises merge, drop it to zero.
3. **Do supports need line of sight to a column?** Proposed no; adjacency only.
   A "support must be behind the weapon" rule would strengthen rows but
   shrink valid layouts on a 4×5 grid. Test after the gate.
4. **Speed toggle default.** If testers always turn it on, that is a design
   signal, not a UX preference. Log it.

---

## 6. Post-POC roadmap: ideas and what they need from the POC

None of these are built in the POC. Each entry says what the POC must leave
in place so the idea is additive.

### 6.1 Hero towers that earn XP

An item class that levels up through use instead of through merging. Gains
XP per kill or per damage dealt, levels at thresholds, each level improving a
stat or unlocking a trait. Gives the run a second progression axis and gives
early-game items a reason to stay in the bag.

Ready when: `itemXpGained` event exists (it does), `ItemDef` has an optional
`xpCurve?: number[]` and `levelEffects?: Effect[][]`, item instances carry
`xp` and `level` (defaulting to 0, ignored by non-hero items), and the save
DTO stores them. Design question for later: can a hero item also merge, or
are XP and merge exclusive? Recommendation: exclusive, so the two axes stay
readable.

### 6.2 Economy towers and items

Coin purse is the only economy item in the POC. The natural family:

| Item | Effect | What it tests |
|---|---|---|
| Coin purse | flat gold per wave | space vs. income |
| Vault (1×2) | interest: +10% of held gold per wave, capped | banking vs. spending |
| Market stall | reroll cost −1 while in bag | shop-heavy strategies |
| Tollgate (defensive + economy) | gold per breach absorbed | turning damage taken into income |
| Scrapper | selling adjacent items refunds 100% | flexible rebuilding |

Ready when: `goldEarned.source` attribution (exists), shop parameters
(reroll cost, sell ratio) are read from a `ShopModifiers` object the bag can
influence rather than constants, and interest is computed in `Run`, not in
the wave sim.

### 6.3 Debuffs

Slow and burn ship in the POC via a generic status system: `StatusKind`,
`StatusDef { stacking: 'refresh' | 'stack' | 'strongest'; tickEffect?;
onApply?; onExpire? }`. The family to add later:

- **Armor break**: −N armor for M ticks. Counterplay to Armored and bosses.
- **Weaken**: enemy deals less breach damage.
- **Mark**: next hit from any source deals +X%. Rewards weapon sequencing.
- **Root**: speed 0 for a very short time. Enables "hold at the line" builds.
- **Chill stacks → Freeze**: a stacking status that converts at a threshold.
  Needs `stacking: 'stack'` and a conversion rule, which is why the status
  def carries a stacking policy from day one.

Ready when: statuses are data (`StatusDef` table), applied through one code
path, and stats already count them per source.

### 6.4 RPG mode between matches

A persistent hero with talents, unlocked items, and a campaign map where each
node is a run or a boss. This is the meta-progression the original pitch
deliberately excluded from the POC ("no permanent upgrades"), and it should
stay excluded until the core loop is proven, because it can mask a weak core.

Ready when:

- The sim takes a single `RunModifiers` input (starting gold, base HP,
  unlocked item pool, global buffs, boss pool). Meta-progression only ever
  writes to that object. Replays then remain deterministic from
  `(seed, modifiers, decisions)`.
- Saves are split: `RunSave` (current run, exists in POC) and `ProfileSave`
  (persistent, empty in POC). Run history from §3.7 already lives on the
  profile side.
- Stats are per-run and aggregable, so campaign nodes can set objectives
  ("clear wave 10 taking ≤5 base damage", "win with no cannons") checked
  against `RunStats`.

Open design question to settle before starting: does the RPG layer change
the *item pool* (roguelike unlocks) or the *hero* (talents that buff the
bag)? The first keeps runs varied; the second risks the power creep that
makes early waves trivial. Recommendation: item pool first.

### 6.5 Boss pool and endless mode

Once two bosses exist as data, a pool of 4–6 with random selection at waves
5 and 10, then an endless mode past wave 10 that cycles bosses with
modifiers. Needs nothing beyond the phase system in §2.8 and a difficulty
scaling function on wave defs.

### 6.6 Asynchronous PvP

Your bag versus another player's recorded wave pressure, or two bags racing
the same seeded wave set. Needs: deterministic sim (POC), `RunStats` for
scoring (POC), and a way to serialise a build (the save DTO, POC). No
backend in the POC, but nothing in the POC blocks one.

---

## 7. Immediate next step

Create the M0 scaffold and the M1 backpack simulation with tests. Nothing in
M1 needs Phaser, so it can be reviewed entirely through the test suite before
any rendering is written.
