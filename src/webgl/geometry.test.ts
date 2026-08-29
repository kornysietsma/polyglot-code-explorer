import { hierarchy, HierarchyNode } from "d3";
import { describe, expect, it } from "vitest";

import {
  FileNode,
  LocData,
  NodeLayout,
  Point,
  TreeNode,
} from "../polyglot_data.types";
import {
  buildFillAttributes,
  buildFills,
  buildOutlines,
  outlineLevel,
} from "./geometry";

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

function fileNode(
  path: string,
  polygon: Point[],
  circleAncestors = 0
): FileNode {
  return {
    name: path,
    path,
    layout: layoutFor(polygon),
    value: 0,
    circleAncestors,
    data: { loc: DUMMY_LOC },
  };
}

// `depth` is readonly in d3's HierarchyNode type (it's normally computed by walking a real
// tree), but buildOutlines only ever reads it as a plain number - overriding it here is a much
// smaller fixture than building a real chain of nested directories just to reach a given depth.
function atDepth<T>(node: HierarchyNode<T>, depth: number): HierarchyNode<T> {
  return Object.assign(node, { depth });
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

    const { positions, colours, patternIndices } = buildFills(nodes, fillFn);

    // triangle -> 1 fan triangle (3 vertices), quad -> 2 fan triangles (6 vertices)
    expect(positions.length).toBe((3 + 6) * 2);
    expect(colours.length).toBe((3 + 6) * 3);
    expect(patternIndices.length).toBe(3 + 6);

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
    // neither node is a team-pattern fill, so every vertex gets the "flat colour" sentinel
    expect([...patternIndices]).toEqual(new Array(9).fill(-1));
  });

  it("returns empty arrays for an empty node list", () => {
    const { positions, colours, patternIndices } = buildFills(
      [],
      () => "#000000"
    );
    expect(positions.length).toBe(0);
    expect(colours.length).toBe(0);
    expect(patternIndices.length).toBe(0);
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

describe("buildFillAttributes", () => {
  it("routes a url(#patternN) fill to patternIndices, not parseCssColour", () => {
    const nodes: HierarchyNode<TreeNode>[] = [
      hierarchy<TreeNode>(fileNode("a", TRIANGLE)),
      hierarchy<TreeNode>(fileNode("b", QUAD)),
    ];
    const fillByPath = new Map([
      ["a", "url(#pattern7)"],
      ["b", "#00ff00"],
    ]);
    const fillFn = (d: HierarchyNode<TreeNode>) => {
      const fill = fillByPath.get(d.data.path);
      if (fill == undefined) throw new Error(`no fill for ${d.data.path}`);
      return fill;
    };

    const { colours, patternIndices } = buildFillAttributes(nodes, fillFn);

    // node "a"'s 3 vertices are all pattern 7, and its colour bytes are unused (left at 0)
    expect([...patternIndices.slice(0, 3)]).toEqual([7, 7, 7]);
    expect([...colours.slice(0, 9)]).toEqual(new Array(9).fill(0));

    // node "b"'s 6 vertices are a flat colour: -1 sentinel, real green
    expect([...patternIndices.slice(3, 9)]).toEqual(new Array(6).fill(-1));
    for (let i = 3; i < 9; i++) {
      expect([colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]]).toEqual([
        0, 1, 0,
      ]);
    }
  });
});

describe("outlineLevel", () => {
  it.each([
    // depth, circleAncestors, expected level
    [0, 0, 4], // level -1: above the first circle-ancestor level -> default
    [1, 0, 0],
    [2, 0, 1],
    [3, 0, 2],
    [4, 0, 3],
    [5, 0, 4], // level 4: past the 4 nested colours -> default
    [8, 0, 4],
    // omf.json's varying-circle-depth case: the same tree depth maps to a different level
    // depending on how many circle-packed ancestors this particular branch has.
    [2, 1, 0],
    [3, 1, 1],
    [3, 2, 0],
    [2, 2, 4], // level -1 again, just reached via a higher circleAncestors this time
  ])(
    "depth %d, circleAncestors %d -> level %d",
    (depth, circleAncestors, expected) => {
      expect(outlineLevel(depth, circleAncestors)).toBe(expected);
    }
  );
});

describe("buildOutlines", () => {
  it("expands a unit quad's 4 edges into 4 constant-width quads sharing the polygon's level", () => {
    const node = atDepth(hierarchy<TreeNode>(fileNode("a", QUAD, 0)), 2);
    const { positions, normals, levels, indices } = buildOutlines([node]);

    // 4 edges * 4 vertices each
    expect(positions.length).toBe(4 * 4 * 2);
    expect(normals.length).toBe(4 * 4 * 2);
    expect(levels.length).toBe(4 * 4);
    expect(indices.length).toBe(4 * 6);

    const expectedLevel = outlineLevel(2, 0); // depth 2, circleAncestors 0 -> 1
    expect(expectedLevel).toBe(1);
    expect([...levels]).toEqual(new Array(16).fill(expectedLevel));

    // `+0` folds any -0 the perpendicular computation produces (e.g. -dy where dy is 0) back to
    // 0 for comparison purposes - same value, distinct only under toEqual's Object.is semantics.
    const noNegZero = (arr: Float32Array) =>
      Float32Array.from(arr, (v) => v + 0);

    // Edge 0: (0,0) -> (1,0), a horizontal edge - normal must be vertical (perpendicular),
    // unit length, and the two straddling vertices sit at +-normal around each endpoint.
    expect(positions.slice(0, 8)).toEqual(
      Float32Array.from([0, 0, 0, 0, 1, 0, 1, 0])
    );
    expect(noNegZero(normals.slice(0, 8))).toEqual(
      Float32Array.from([0, 1, 0, -1, 0, 1, 0, -1])
    );
    // Edge 1: (1,0) -> (1,1), a vertical edge - normal must be horizontal.
    expect(noNegZero(normals.slice(8, 16))).toEqual(
      Float32Array.from([-1, 0, 1, 0, -1, 0, 1, 0])
    );

    // The two triangles per edge (base,base+1,base+2) and (base+2,base+1,base+3) share the
    // (base+1, base+2) edge - together covering the full expanded quad for that polygon edge.
    expect(indices.slice(0, 6)).toEqual(Uint32Array.from([0, 1, 2, 2, 1, 3]));
    expect(indices.slice(6, 12)).toEqual(Uint32Array.from([4, 5, 6, 6, 5, 7]));
  });

  it("normalises a diagonal edge to unit length", () => {
    // A 3-4-5 triangle so the hypotenuse has an exactly-representable length.
    const triangle: Point[] = [
      [0, 0],
      [3, 0],
      [0, 4],
    ];
    const node = atDepth(hierarchy<TreeNode>(fileNode("b", triangle, 0)), 1);
    const { normals } = buildOutlines([node]);

    // Edge 2 is (0,4) -> (0,0) in this fixture... instead just check every normal in the
    // buffer is unit length, which covers the diagonal edge (3,0)->(0,4) along with the two
    // axis-aligned ones.
    for (let i = 0; i < normals.length; i += 2) {
      const nx = normals[i]!;
      const ny = normals[i + 1]!;
      expect(Math.hypot(nx, ny)).toBeCloseTo(1, 6);
    }
  });

  it("returns empty arrays for an empty node list", () => {
    const { positions, normals, levels, indices } = buildOutlines([]);
    expect(positions.length).toBe(0);
    expect(normals.length).toBe(0);
    expect(levels.length).toBe(0);
    expect(indices.length).toBe(0);
  });
});
