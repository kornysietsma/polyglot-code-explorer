import { hierarchy } from "d3";
import { describe, expect, it } from "vitest";

import { TreeNode } from "./polyglot_data.types";
import { minimalDirectoryNode, minimalFileNode } from "./testFixtures";
import { selectNodesToDraw } from "./vizNodeSelection";

// A shape close to what `data/nested.json` renders: a circle-packed root whose children are
// themselves circle-packed groups, and one plain branch alongside them.
//
//   root                             depth 0   circlePack
//   ├── group          (a circle)    depth 1   circlePack
//   │   ├── repo       (a circle)    depth 2   voronoi
//   │   │   ├── src                  depth 3
//   │   │   │   └── deep.ts          depth 4
//   │   │   └── README.md            depth 3
//   │   └── other                    depth 2
//   │       └── other.ts             depth 3
//   └── plain                        depth 1
//       └── plain.ts                 depth 2
function nestedTree(): TreeNode {
  const dir = (name: string, children: TreeNode[]) =>
    minimalDirectoryNode(name, name, children);
  const file = (name: string) => minimalFileNode(name, name);

  return dir("root", [
    dir("group", [
      dir("repo", [dir("src", [file("deep.ts")]), file("README.md")]),
      dir("other", [file("other.ts")]),
    ]),
    dir("plain", [file("plain.ts")]),
  ]);
}

function draw(maxDepth: number) {
  const { fills, outlines } = selectNodesToDraw(
    hierarchy<TreeNode>(nestedTree()),
    maxDepth
  );
  return {
    fills: fills.map((node) => node.data.name),
    outlines: outlines.map((node) => node.data.name),
    outlineDepths: outlines.map((node) => node.depth),
  };
}

describe("selectNodesToDraw", () => {
  describe("with the depth limit past the bottom of the tree", () => {
    it("fills the leaves only - a directory is covered by its own children", () => {
      expect(draw(10).fills.sort()).toEqual([
        "README.md",
        "deep.ts",
        "other.ts",
        "plain.ts",
      ]);
    });

    it("outlines every node except the root, whose boundary is the diagram's edge", () => {
      expect(draw(10).outlines.sort()).toEqual([
        "README.md",
        "deep.ts",
        "group",
        "other",
        "other.ts",
        "plain",
        "plain.ts",
        "repo",
        "src",
      ]);
    });
  });

  // The regression this module exists to prevent: `group` and `repo` are circles whose children
  // are circles, so nothing tiles their boundary and they carry no fill of their own. Derive the
  // outline set from the fill set and their circles disappear from the diagram entirely - a
  // silent wrong picture rather than a failure.
  it("outlines interior directories that carry no fill of their own", () => {
    const { fills, outlines } = draw(10);

    for (const interior of ["group", "repo", "src", "plain", "other"]) {
      expect(fills).not.toContain(interior);
      expect(outlines).toContain(interior);
    }
  });

  // GlRenderer relies on this: outlines cover the cells plus the interior nodes that have none.
  it("outlines a superset of what it fills, at every depth limit", () => {
    for (let maxDepth = 0; maxDepth <= 5; maxDepth++) {
      const { fills, outlines } = draw(maxDepth);
      expect(outlines).toEqual(expect.arrayContaining(fills));
    }
  });

  it("paints outlines deepest-first, so shallower strokes land on top", () => {
    const { outlineDepths } = draw(10);
    expect([...outlineDepths].sort((a, b) => b - a)).toEqual(outlineDepths);
  });

  describe("with the depth limit truncating the tree", () => {
    it("fills the directories at the limit, since their children aren't drawn", () => {
      // depth 2 is `repo`/`other`/`plain.ts` - `repo` and `other` still have children, but with
      // nothing drawn below them they are the leaves the user sees
      expect(draw(2).fills.sort()).toEqual(["other", "plain.ts", "repo"]);
    });

    it("draws nothing below the limit", () => {
      expect(draw(2).outlines).not.toContain("src");
      expect(draw(2).outlines).not.toContain("README.md");
    });

    it("still outlines the circles above the limit", () => {
      expect(draw(2).outlines).toContain("group");
      expect(draw(2).outlines).toContain("plain");
    });
  });

  // The one case where the root gets an outline: it is the only thing drawn, so without one
  // there is no boundary on screen at all.
  describe("with a depth limit of 0", () => {
    it("fills and outlines the root alone", () => {
      expect(draw(0)).toMatchObject({
        fills: ["root"],
        outlines: ["root"],
      });
    });
  });
});
