import { hierarchy, HierarchyNode } from "d3";
import { describe, expect, it } from "vitest";

import { Point, TreeNode } from "../polyglot_data.types";
import { minimalFileNode } from "../testFixtures";
import { buildIndex, pick, pointInConvexPolygon } from "./picking";

function fileNode(path: string, center: Point, polygon: Point[]) {
  return minimalFileNode(path, path, { layout: { center, polygon } });
}

const SQUARE_CCW: Point[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];
const SQUARE_CW: Point[] = [...SQUARE_CCW].reverse() as Point[];

describe("pointInConvexPolygon", () => {
  it("is true for a point in the interior", () => {
    expect(pointInConvexPolygon(SQUARE_CCW, 2, 2)).toBe(true);
  });

  it("is false for a point outside", () => {
    expect(pointInConvexPolygon(SQUARE_CCW, 5, 5)).toBe(false);
  });

  it("is true for a point exactly on an edge", () => {
    expect(pointInConvexPolygon(SQUARE_CCW, 0, 2)).toBe(true);
  });

  it("is true for a point exactly on a vertex", () => {
    expect(pointInConvexPolygon(SQUARE_CCW, 0, 0)).toBe(true);
  });

  it("agrees regardless of winding order", () => {
    expect(pointInConvexPolygon(SQUARE_CW, 2, 2)).toBe(true);
    expect(pointInConvexPolygon(SQUARE_CW, 5, 5)).toBe(false);
  });
});

describe("buildIndex / pick", () => {
  it("returns the containing cell when its centroid is also the nearest", () => {
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(
        fileNode(
          "left",
          [1, 0],
          [
            [0, -1],
            [2, -1],
            [2, 1],
            [0, 1],
          ]
        )
      ),
      hierarchy<TreeNode>(
        fileNode(
          "middle",
          [4, 0],
          [
            [2, -1],
            [6, -1],
            [6, 1],
            [2, 1],
          ]
        )
      ),
      hierarchy<TreeNode>(
        fileNode(
          "right",
          [7, 0],
          [
            [6, -1],
            [8, -1],
            [8, 1],
            [6, 1],
          ]
        )
      ),
    ];
    const index = buildIndex(nodes);

    expect(pick(index, 4, 0)?.data.path).toBe("middle");
  });

  it("returns null for a background click, well outside every cell", () => {
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(
        fileNode(
          "only",
          [0, 0],
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]
        )
      ),
    ];
    const index = buildIndex(nodes);

    expect(pick(index, 500, 500)).toBeNull();
  });

  it("widens the search when the nearest centroid's cell doesn't contain the point", () => {
    // "near" sits right next to the query point and has the closer declared centroid, but its
    // small polygon doesn't actually reach the point. "far" is a large, clipped-looking cell
    // whose declared centroid (near its own left edge, not its true geometric centroid) is much
    // further from the query point - the case the widening search exists for.
    const near = fileNode(
      "near",
      [17, 0],
      [
        [16.5, -0.5],
        [17.5, -0.5],
        [17.5, 0.5],
        [16.5, 0.5],
      ]
    );
    const far = fileNode(
      "far",
      [6, 0], // declared centroid, far from the polygon's true centre at x=12.5
      [
        [5, -1],
        [20, -1],
        [20, 1],
        [5, 1],
      ]
    );
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(near),
      hierarchy<TreeNode>(far),
    ];
    const index = buildIndex(nodes);
    const query: Point = [18, 0];

    // Sanity check on the scenario itself: "near"'s centroid really is closer to the query
    // point than "far"'s, even though the query point only lies inside "far"'s polygon.
    expect(Math.hypot(17 - query[0], 0 - query[1])).toBeLessThan(
      Math.hypot(6 - query[0], 0 - query[1])
    );
    expect(pointInConvexPolygon(near.layout.polygon, ...query)).toBe(false);
    expect(pointInConvexPolygon(far.layout.polygon, ...query)).toBe(true);

    expect(pick(index, ...query)?.data.path).toBe("far");
  });
});
