import { describe, expect, it } from "vite-plus/test";
import { bounds } from "../../src/sim/grid/shapes.ts";
import { hasItemDef, ITEM_DEFS, itemDef, SHOP_ITEM_DEFS } from "../../src/sim/items/defs.ts";
import { isWeapon, tierData } from "../../src/sim/items/types.ts";

describe("item definitions", () => {
  it("has 12 shop items and 3 crafted results with unique ids", () => {
    expect(SHOP_ITEM_DEFS).toHaveLength(12);
    expect(ITEM_DEFS.filter((d) => d.craftedOnly)).toHaveLength(3);
    expect(new Set(ITEM_DEFS.map((d) => d.id)).size).toBe(ITEM_DEFS.length);
  });

  it("every item has three tiers and a shape that fits the grid", () => {
    for (const d of ITEM_DEFS) {
      expect(d.tiers).toHaveLength(3);
      const b = bounds(d.shape, 0);
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
      expect(Math.max(b.w, b.h)).toBeLessThanOrEqual(2);
      expect(d.cost).toBeGreaterThan(0);
    }
  });

  it("weapons carry weapon stats at every tier, non-weapons do not", () => {
    for (const d of ITEM_DEFS) {
      for (const t of [1, 2, 3] as const) {
        const td = tierData(d, t);
        if (isWeapon(d)) {
          expect(td.weapon, d.id).toBeDefined();
          expect(td.weapon!.damage).toBeGreaterThan(0);
          expect(td.weapon!.cooldownTicks).toBeGreaterThan(0);
        } else {
          expect(td.weapon, d.id).toBeUndefined();
        }
        if (d.itemClass === "defensive") expect(td.defensive, d.id).toBeDefined();
      }
    }
  });

  it("damage scales up with tier and never down", () => {
    for (const d of ITEM_DEFS.filter(isWeapon)) {
      const [t1, t2, t3] = d.tiers.map((t) => t.weapon!.damage);
      expect(t2).toBeGreaterThanOrEqual(t1!);
      expect(t3).toBeGreaterThan(t2!);
    }
  });

  it("all stats are integers", () => {
    const json = JSON.stringify(ITEM_DEFS);
    for (const n of json.match(/-?\d+\.\d+/g) ?? []) expect(n, "non-integer stat").toBeUndefined();
  });

  it("looks up by id and throws on unknown", () => {
    expect(itemDef("crossbow").name).toBe("Crossbow");
    expect(hasItemDef("nope")).toBe(false);
    expect(() => itemDef("nope")).toThrow(/Unknown item def/);
  });

  it("ammo ports are declared for the factory layer", () => {
    expect(itemDef("ammo_pouch").ports?.provides).toEqual(["ammo"]);
    for (const id of ["crossbow", "cannon", "ballista"]) {
      expect(itemDef(id).ports?.consumes, id).toEqual(["ammo"]);
    }
  });
});
