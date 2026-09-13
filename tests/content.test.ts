import { describe, expect, it } from "vite-plus/test";
import { CONTENT, PACKS, enemyText, itemText, selectPack, ui } from "../src/content/index.ts";
import { ENEMY_DEFS } from "../src/sim/combat/enemies.ts";
import { ITEM_DEFS } from "../src/sim/items/defs.ts";
import { describeItem } from "../src/render/describe.ts";

describe("content packs", () => {
  for (const pack of Object.values(PACKS)) {
    it(`${pack.id} names every item and enemy the simulation defines, and nothing else`, () => {
      const itemIds = new Set(ITEM_DEFS.map((d) => d.id));
      for (const id of itemIds) {
        const t = pack.items[id];
        expect(t, `missing item text for ${id}`).toBeDefined();
        expect(t!.name.length).toBeGreaterThan(0);
        expect(t!.description.length).toBeGreaterThan(0);
      }
      for (const id of Object.keys(pack.items))
        expect(itemIds.has(id), `orphan item text ${id}`).toBe(true);
      const enemyIds = new Set(ENEMY_DEFS.map((d) => d.id));
      for (const id of enemyIds)
        expect(pack.enemies[id], `missing enemy text for ${id}`).toBeDefined();
      for (const id of Object.keys(pack.enemies))
        expect(enemyIds.has(id), `orphan enemy text ${id}`).toBe(true);
    });
  }

  it("every pack has the same ui keys as the placeholder", () => {
    const keys = Object.keys(PACKS["placeholder"]!.ui).sort();
    for (const pack of Object.values(PACKS)) expect(Object.keys(pack.ui).sort()).toEqual(keys);
  });

  it("falls back to the id when text is missing", () => {
    expect(itemText(CONTENT, "nope")).toEqual({ name: "nope", description: "" });
    expect(enemyText(CONTENT, "nope")).toEqual({ name: "nope" });
    expect(ui(CONTENT, "nope")).toBe("nope");
    expect(ui(CONTENT, "startWave")).toBe("Start wave");
  });

  it("selectPack switches the live binding and falls back to placeholder", () => {
    expect(selectPack("scifi").id).toBe("scifi");
    expect(CONTENT.id).toBe("scifi");
    expect(itemText(CONTENT, "crossbow").name).toBe("Rail turret");
    expect(selectPack("nope").id).toBe("placeholder");
    expect(selectPack(undefined).id).toBe("placeholder");
  });

  it("describeItem produces mechanics lines for every item and tier, from data, in every pack", () => {
    for (const packId of Object.keys(PACKS)) {
      selectPack(packId);
      for (const d of ITEM_DEFS) {
        for (const tier of [1, 2, 3] as const) {
          const info = describeItem(d.id, tier);
          expect(info.title.length, `${packId}/${d.id}`).toBeGreaterThan(0);
          expect(info.lines.length, `${packId}/${d.id} t${tier}`).toBeGreaterThan(0);
          // No raw ui keys leaked (every key is camelCase without spaces; lines should contain spaces or digits)
          for (const l of info.lines) expect(/[ \d]/.test(l), l).toBe(true);
        }
      }
    }
    selectPack("placeholder");
  });
});
