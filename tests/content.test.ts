import { describe, expect, it } from "vite-plus/test";
import { CONTENT, enemyText, itemText, ui } from "../src/content/index.ts";
import { ITEM_DEFS } from "../src/sim/items/defs.ts";

describe("content pack", () => {
  it("names every item the simulation defines", () => {
    for (const d of ITEM_DEFS) {
      const t = CONTENT.items[d.id];
      expect(t, `missing content for ${d.id}`).toBeDefined();
      expect(t!.name.length).toBeGreaterThan(0);
      expect(t!.description.length).toBeGreaterThan(0);
    }
  });

  it("has no content for items that do not exist", () => {
    const defIds = new Set(ITEM_DEFS.map((d) => d.id));
    for (const id of Object.keys(CONTENT.items))
      expect(defIds.has(id), `orphan text ${id}`).toBe(true);
  });

  it("falls back to the id when text is missing", () => {
    expect(itemText(CONTENT, "nope")).toEqual({ name: "nope", description: "" });
    expect(enemyText(CONTENT, "nope")).toEqual({ name: "nope" });
    expect(ui(CONTENT, "nope")).toBe("nope");
    expect(ui(CONTENT, "startWave")).toBe("Start wave");
  });
});
