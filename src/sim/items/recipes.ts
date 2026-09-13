/**
 * Crafting: dropping item A onto item B where (A, B) is a recipe replaces
 * B with the result, which takes B's position and orientation if its
 * shape fits there. Recipes are unordered pairs. docs/PLAN.md §2.6.
 */
export interface Recipe {
  readonly inputs: readonly [string, string];
  readonly result: string;
}

export const RECIPES: readonly Recipe[] = [
  { inputs: ["fire_rune", "crossbow"], result: "flaming_repeater" },
  { inputs: ["frost_flask", "cannon"], result: "glacier_mortar" },
  { inputs: ["ammo_pouch", "ballista"], result: "siege_engine" },
];

export function findRecipe(a: string, b: string): Recipe | undefined {
  return RECIPES.find(
    (r) => (r.inputs[0] === a && r.inputs[1] === b) || (r.inputs[0] === b && r.inputs[1] === a),
  );
}

/** Every recipe partner for a given item id (for shop hints). */
export function recipePartners(defId: string): string[] {
  const out: string[] = [];
  for (const r of RECIPES) {
    if (r.inputs[0] === defId) out.push(r.inputs[1]);
    else if (r.inputs[1] === defId) out.push(r.inputs[0]);
  }
  return out.sort();
}
