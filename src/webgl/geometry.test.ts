import { hierarchy, HierarchyNode } from "d3";
import { describe, expect, it } from "vitest";

import {
  FileNode,
  LocData,
  NodeLayout,
  Point,
  TreeNode,
} from "../polyglot_data.types";
import { buildFills } from "./geometry";

// Same minimal-fixture convention as nodeData.test.ts's minimalFileNode.
const DUMMY_LOC: LocData = {
  language: "test",
  binary: false,
  blanks: 1,
  code: 2,
  comments: 3,
  lines: 4,
  bytes: 5,
};

function layoutFor(polygon: Point[]): NodeLayout {
  return { algorithm: "voronoi", center: [0, 0], polygon };
}

function fileNode(path: string, polygon: Point[]): FileNode {
  return {
    name: path,
    path,
    layout: layoutFor(polygon),
    value: 0,
    data: { loc: DUMMY_LOC },
  };
}

const TRIANGLE: Point[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const QUAD: Point[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("buildFills", () => {
  it("produces one triangle-fan's worth of positions and matching colours per node", () => {
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(fileNode("a", TRIANGLE)),
      hierarchy<TreeNode>(fileNode("b", QUAD)),
    ];
    const colourByPath = new Map([
      ["a", "#ff0000"],
      ["b", "#00ff00"],
    ]);
    const fillFn = (d: HierarchyNode<TreeNode>) => {
      const colour = colourByPath.get(d.data.path);
      if (colour == undefined) throw new Error(`no colour for ${d.data.path}`);
      return colour;
    };

    const { positions, colours } = buildFills(nodes, fillFn);

    // triangle -> 1 fan triangle (3 vertices), quad -> 2 fan triangles (6 vertices)
    expect(positions.length).toBe((3 + 6) * 2);
    expect(colours.length).toBe((3 + 6) * 3);

    // node "a"'s 3 vertices are all red
    for (let i = 0; i < 3; i++) {
      expect([colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]]).toEqual([
        1, 0, 0,
      ]);
    }
    // node "b"'s 6 vertices are all green, starting right after node "a"'s
    for (let i = 3; i < 9; i++) {
      expect([colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]]).toEqual([
        0, 1, 0,
      ]);
    }
  });

  it("returns empty arrays for an empty node list", () => {
    const { positions, colours } = buildFills([], () => "#000000");
    expect(positions.length).toBe(0);
    expect(colours.length).toBe(0);
  });

  it("propagates assertConvex's rejection of a concave polygon", () => {
    const concave: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 1],
      [0, 4],
    ];
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(fileNode("c", concave)),
    ];
    expect(() => buildFills(nodes, () => "#000000")).toThrow(/not convex/);
  });
});
