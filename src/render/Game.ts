import Phaser from "phaser";
import { COLORS, VIEW_H, VIEW_W } from "./layout.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { RunScene } from "./scenes/RunScene.ts";

export function createGame(parent: string): Phaser.Game {
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
  });
}
