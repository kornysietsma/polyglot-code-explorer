// Pure hit-testing for the WebGL fill layer. `screenToWorld` (camera.ts) is the caller's job;
// everything here works in world units so click and hover picking can't drift apart.

import { HierarchyNode, Quadtree, quadtree, QuadtreeLeaf } from "d3";

import { Point, TreeNode } from "../polyglot_data.types";

const NEAREST_CANDIDATE_COUNT = 16;

export interface PickIndex {
  quadtree: Quadtree<HierarchyNode<TreeNode>>;
}

// Sign-consistency of the cross product across every edge - the same technique triangulate.ts's
// assertConvex uses to validate convexity, used here the other way round, as a containment test.
// Exact for convex polygons. A point exactly on an edge (zero cross product) is treated as inside
// rather than as a miss, matching assertConvex's tolerance of a collinear vertex: adjacent cells
// share a border, so "exactly on the line" has to resolve to a cell, not fall through as a
// background click.
export function pointInConvexPolygon(
  polygon: readonly Point[],
  x: number,
  y: number
): boolean {
  const n = polygon.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % n]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue; // on the edge line - inconclusive, not a violation
    const thisSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = thisSign;
    else if (thisSign !== sign) return false;
  }
  return true;
}

// One point per node, keyed on node.layout.center. Build from the same depth-filtered node list
// the fill geometry uses, so a pick can never return a node that isn't actually drawn.
export function buildIndex(
  nodes: readonly HierarchyNode<TreeNode>[]
): PickIndex {
  const tree = quadtree<HierarchyNode<TreeNode>>()
    .x((d) => d.data.layout.center[0])
    .y((d) => d.data.layout.center[1])
    .addAll(nodes as HierarchyNode<TreeNode>[]);
  return { quadtree: tree };
}

function distance(node: HierarchyNode<TreeNode>, x: number, y: number): number {
  const [cx, cy] = node.data.layout.center;
  return Math.hypot(cx - x, cy - y);
}

// Every node whose centroid falls within `radius` of (x,y) - the standard d3-quadtree
// radius-search recipe: pre-order visit, pruning any subtree whose bounding box can't intersect
// the search circle's bounding square.
function collectWithinRadius(
  tree: Quadtree<HierarchyNode<TreeNode>>,
  x: number,
  y: number,
  radius: number
): HierarchyNode<TreeNode>[] {
  const found: HierarchyNode<TreeNode>[] = [];
  tree.visit((node, x0, y0, x1, y1) => {
    if (!node.length) {
      let leaf: QuadtreeLeaf<HierarchyNode<TreeNode>> | undefined = node;
      do {
        if (distance(leaf.data, x, y) <= radius) found.push(leaf.data);
        leaf = leaf.next;
      } while (leaf);
    }
    return (
      x0 > x + radius || x1 < x - radius || y0 > y + radius || y1 < y - radius
    );
  });
  return found;
}

// Doubles the search radius from a seed derived from the tree's own extent until at least
// `minCount` centroids are found or the search already covers the whole tree. There's no history
// of a previous radius to reuse - picking must work correctly on the very first click after a
// tree is built.
function nearestCandidates(
  tree: Quadtree<HierarchyNode<TreeNode>>,
  x: number,
  y: number,
  minCount: number
): HierarchyNode<TreeNode>[] {
  const extent = tree.extent();
  if (!extent) return [];
  const [[x0, y0], [x1, y1]] = extent;
  const fullDiagonal = Math.hypot(x1 - x0, y1 - y0);
  if (fullDiagonal === 0) return collectWithinRadius(tree, x, y, 1);

  let radius = fullDiagonal / 200; // arbitrary small seed - doubles quickly if too small
  let found: HierarchyNode<TreeNode>[] = [];
  while (found.length < minCount && radius < fullDiagonal * 2) {
    found = collectWithinRadius(tree, x, y, radius);
    radius *= 2;
  }
  return found;
}

// Nearest centroid first - the fast path for the overwhelming majority of clicks. If that
// polygon doesn't actually contain the point (possible for clipped/weighted cells, where the
// centroid can sit outside the cell's true area), widen to the nearest ~16 centroids, closest
// first, and take the first whose polygon contains the point. `null` means a background click.
export function pick(
  index: PickIndex,
  worldX: number,
  worldY: number
): HierarchyNode<TreeNode> | null {
  const nearest = index.quadtree.find(worldX, worldY);
  if (
    nearest &&
    pointInConvexPolygon(nearest.data.layout.polygon, worldX, worldY)
  ) {
    return nearest;
  }

  const candidates = nearestCandidates(
    index.quadtree,
    worldX,
    worldY,
    NEAREST_CANDIDATE_COUNT
  ).sort((a, b) => distance(a, worldX, worldY) - distance(b, worldX, worldY));

  for (const candidate of candidates) {
    if (pointInConvexPolygon(candidate.data.layout.polygon, worldX, worldY)) {
      return candidate;
    }
  }
  return null;
}
