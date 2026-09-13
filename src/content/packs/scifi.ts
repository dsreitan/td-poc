import { PLACEHOLDER_PACK } from "./placeholder.ts";
import type { ContentPack } from "../types.ts";

/**
 * Second pack: proves the reskin seam (docs/PLAN.md §3.9). Same ids, new
 * fiction. UI strings fall back to the placeholder pack where unchanged.
 * Select with `?pack=scifi`.
 */
export const SCIFI_PACK: ContentPack = {
  id: "scifi",
  title: "Hull Breach",
  tagline: "The cargo bay is the last bulkhead.",
  items: {
    crossbow: {
      name: "Rail turret",
      description: "Fires a slug at the nearest intruder in its corridor.",
    },
    cannon: {
      name: "Plasma mortar",
      description: "Slow shell with a blast radius. Covers every corridor it spans.",
    },
    flame_lance: {
      name: "Cutting laser",
      description: "Continuous beam on the nearest intruder. Ignores plating.",
    },
    ballista: {
      name: "Coil driver",
      description: "Heavy slug that punches through up to three intruders.",
    },
    frost_flask: { name: "Cryo canister", description: "Adjacent turrets chill what they hit." },
    gearbox: { name: "Servo booster", description: "Adjacent turrets cycle faster." },
    ammo_pouch: { name: "Magazine feed", description: "Adjacent slug turrets hit harder." },
    fire_rune: {
      name: "Incendiary core",
      description: "Adjacent turrets ignite what they hit. Also a fabrication part.",
    },
    lodestone: {
      name: "Targeting relay",
      description: "Adjacent turrets can also fire into neighbouring corridors.",
    },
    spiked_shield: {
      name: "Shock plate",
      description: "Stops one breach in its corridor and shocks the intruder.",
    },
    iron_wall: { name: "Blast door", description: "Absorbs several breaches per assault." },
    coin_purse: {
      name: "Salvage drone",
      description: "Earns credits every assault. Takes up valuable space.",
    },
    flaming_repeater: {
      name: "Incendiary rail",
      description: "Incendiary core + Rail turret. Rapid slugs that ignite.",
    },
    glacier_mortar: {
      name: "Cryo mortar",
      description: "Cryo canister + Plasma mortar. A blast that chills.",
    },
    siege_engine: {
      name: "Breacher cannon",
      description: "Magazine feed + Coil driver. Punches through the whole corridor.",
    },
  },
  enemies: {
    grunt: { name: "Drone" },
    runner: { name: "Skitter" },
    armored: { name: "Plated" },
    swarmling: { name: "Mite" },
    warden: { name: "Sentinel" },
    bulwark: { name: "Juggernaut" },
  },
  ui: {
    ...PLACEHOLDER_PACK.ui,
    startWave: "Seal & hold",
    gold: "Credits",
    wave: "Assault",
    base: "Hull",
    nextWave: "Next assault",
    victory: "Hull holds",
    defeat: "Hull breached",
    enemies: "intruders",
    baseDamage: "hull dmg",
  },
};
