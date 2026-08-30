// Which nodes of the tree get drawn, given the depth limit - the pure half of what `Viz.tsx`'s
// `draw()` hands to `GlRenderer.setGeometry()`.
//
// Kept out of `src/webgl/` for the same reason as `vizUpdatePaths.ts`: those modules stay
// decoupled from anything above them, and this is where the depth control meets the renderer.
// It is also the one part of `draw()` that unit tests can reach, `Viz.tsx` being imperative D3
// throughout.

import { HierarchyNode } from "d3";

import { TreeNode } from "./polyglot_data.types";

export interface NodesToDraw {
  /**
   * The cell set: the nodes that get a fill. Also what the picking index is built from, so a
   * pick can never return a node with no fill.
   */
  fills: HierarchyNode<TreeNode>[];
  /**
   * One outline per node - a superset of `fills`, sorted depth-descending. Painting is all fills
   * then all outlines in buffer order with no depth test, so shallower (wider) strokes have to
   * come later in this list to land on top of deeper ones.
   */
  outlines: HierarchyNode<TreeNode>[];
}

// A directory whose children are all drawn on top of it never shows its own fill, so filling it
// would be wasted work on a large tree - except at the depth limit, where its children aren't
// drawn at all and it becomes the leaf the user sees.
function isDrawnAsACell(
  node: HierarchyNode<TreeNode>,
  maxDepth: number
): boolean {
  return node.children === undefined || node.depth === maxDepth;
}

/**
 * Outlines are deliberately *not* derived from the fill set. A circle-packed node's boundary is
 * only implied by whatever its children happen to tile - and a circle full of packed circles
 * tiles nothing at all, so taking outlines from the cells would make the whole group vanish
 * rather than fail. `geometry.ts`'s `outlineLevel` is what then tells a circle boundary from an
 * ordinary nesting stroke.
 *
 * The root is left out: its boundary is the edge of the whole diagram. The exception is a depth
 * limit of 0, where the root is the only thing drawn and so needs its own outline.
 */
export function selectNodesToDraw(
  root: HierarchyNode<TreeNode>,
  maxDepth: number
): NodesToDraw {
  const withinDepth = root
    .descendants()
    .filter((node) => node.depth <= maxDepth);

  return {
    fills: withinDepth.filter((node) => isDrawnAsACell(node, maxDepth)),
    outlines: withinDepth
      .filter((node) => node.depth >= 1 || isDrawnAsACell(node, maxDepth))
      .sort((left, right) => right.depth - left.depth),
  };
}
