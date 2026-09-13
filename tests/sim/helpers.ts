import { Backpack, type ItemSpec } from "../../src/sim/grid/Backpack.ts";
import type { Cell, Orientation } from "../../src/sim/grid/shapes.ts";
import { itemDef } from "../../src/sim/items/defs.ts";
import type { WaveDef } from "../../src/sim/combat/waves.ts";

export type Placement = [
  defId: string,
  anchor: Cell,
  orientation?: Orientation,
  tier?: 1 | 2 | 3,
  id?: string,
];

export function build(placements: Placement[]): Backpack {
  const bp = new Backpack();
  placements.forEach(([defId, anchor, orientation = 0, tier = 1, id], i) => {
    const spec: ItemSpec = {
      id: id ?? `${defId}#${i + 1}`,
      defId,
      tier,
      shape: itemDef(defId).shape,
    };
    const r = bp.place(spec, anchor, orientation);
    if (!r.ok) throw new Error(`cannot place ${spec.id}: ${r.reason}`);
  });
  return bp;
}

/** A single-group wave for focused tests. */
export function wave(spawns: WaveDef["spawns"], id = 99, clearBonus = 0): WaveDef {
  return { id, spawns, clearBonus };
}
