import Phaser from "phaser";
import { COLORS, VIEW_H, VIEW_W } from "./layout.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { RunScene } from "./scenes/RunScene.ts";

/** `?seed=123` reproduces a run: same offers, same waves, same outcome for the same decisions. */
export function seedFromUrl(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("seed");
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}

export function createGame(parent: string, seed?: number): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: { pixelArt: false, antialias: true },
    scene: [BootScene, RunScene],
    callbacks: {
      postBoot: (game) => {
        game.registry.set("seed", seed);
      },
    },
  });
}
