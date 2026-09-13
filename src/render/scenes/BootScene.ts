import Phaser from "phaser";

/** Placeholder-art project: nothing to preload yet. Hands off to the run. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.scene.start("run");
  }
}
