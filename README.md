# td-poc

Backpack Bastion: a portrait tower-defense prototype where the inventory grid
is the tower formation. Enemies come down four lanes; weapons in a 4×5
backpack fire up their own column; supports buff neighbours; the layout is the
strategy.

See [docs/PLAN.md](docs/PLAN.md) for the concept review, locked design rules,
architecture and milestones.

## Play

Live build: https://dsreitan.github.io/td-poc/ (every push to `main` deploys).

- `?seed=123` reproduces a run. `?pack=scifi` switches the content pack.
- Drag from the shop into the bag; columns are lanes. Tap an item to rotate,
  hold it for details. Drop like onto like to merge; some pairs craft.

## Develop

```
vp install        # deps (Vite+; Node 22.18+ or 24)
vp dev            # dev server
vp check          # format + lint + types
vp test           # unit tests (sim rules, stats, replay golden)
vp build          # production build to dist/
vp run e2e        # browser tests against dist/ (needs Chromium; E2E_CHROMIUM=/path to override)
vp run sim:bench  # balance harness: static builds + autopilot buyer
```

Layout: `src/sim` is the pure simulation (no Phaser, enforced by lint and a
test), `src/render` is Phaser 4, `src/content` holds every player-visible
string and art key, `src/save` persistence. Plan and rules: `docs/PLAN.md`.
