import { defineConfig } from "vite-plus";

/**
 * Single Vite+ config: dev/build (Vite), test (Vitest), lint (Oxlint),
 * fmt (Oxfmt), staged checks and tasks. See docs/PLAN.md §3.5.
 *
 * VITE_BASE is set by the GitHub Pages workflow to "/td-poc/"; local dev
 * serves from "/".
 */
export default defineConfig({
  base: process.env["VITE_BASE"] ?? "/",

  build: {
    target: "es2022",
    sourcemap: true,
    // Phaser is one ~1.2 MB chunk by design; do not warn about it.
    chunkSizeWarningLimit: 1500,
  },

  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },

  fmt: {
    // The design doc keeps its hand-written table layout.
    ignorePatterns: ["docs/**"],
  },

  lint: {
    ignorePatterns: ["dist/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
    overrides: [
      {
        // The simulation is pure TypeScript. It must never import the
        // renderer or Phaser, and must never use unseeded randomness.
        // tests/boundary.test.ts enforces the same rule independently.
        files: ["src/sim/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [{ name: "phaser", message: "src/sim must not depend on Phaser." }],
              patterns: [
                {
                  group: ["**/render/**", "../render/*", "../../render/*"],
                  message: "src/sim must not import from src/render.",
                },
              ],
            },
          ],
          "no-restricted-globals": [
            "error",
            { name: "window", message: "No DOM in the simulation." },
            { name: "document", message: "No DOM in the simulation." },
          ],
        },
      },
    ],
  },

  staged: {
    "*.{ts,js,json,md,html,css}": "vp check --fix",
  },

  run: {
    tasks: {
      // Balance harness (M2+): headless seeded runs, prints wave clear rates.
      "sim:bench": { command: "vp exec vite-node scripts/bench.ts", cache: false },
    },
  },
});
