import { hierarchy, HierarchyNode } from "d3";
import { describe, expect, it } from "vitest";

import {
  DirectoryNode,
  FeatureFlags,
  FileNode,
  TreeNode,
} from "../polyglot_data.types";
import { State, themedColours } from "../state";
import {
  minimalDirectoryNode,
  minimalFileNode,
  minimalState,
  vizMetadata,
} from "../testFixtures";
import { BaseVisualization } from "./BaseVisualization";

// `fillFn` is the one piece of colouring logic every visualisation shares: it decides when to
// ignore the visualisation's own scale entirely. Those overrides are what make a nested-circle
// layout readable, so they are worth pinning independently of any one visualisation.

const SCALE_COLOUR = "#123456";
const FEATURES: FeatureFlags = {
  git: false,
  coupling: false,
  git_details: false,
  file_stats: true,
};

// Returns a fixed colour for anything with a value, and no value at all for a node named
// "valueless" - so a test can tell "the scale said this" from "the scale had nothing to say".
class TestVisualization extends BaseVisualization<number> {
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    return d.data.name === "valueless" ? undefined : 1;
  }
  parentFn(d: HierarchyNode<DirectoryNode>): number | undefined {
    return d.data.name === "valueless" ? undefined : 1;
  }
  scale = () => SCALE_COLOUR;
  colourKey(): [string, string][] {
    return [];
  }
}

function fillOf(state: State, node: TreeNode): string {
  const visualization = new TestVisualization(
    state,
    vizMetadata(),
    FEATURES,
    undefined
  );
  return visualization.fillFn(hierarchy<TreeNode>(node));
}

function createdAt(name: string, created: number) {
  return minimalFileNode(name, name, {
    data: { file_stats: { created, modified: created } },
  });
}

describe("the fill colour every visualisation shares", () => {
  const state = minimalState();
  state.config.filters.dateRange = { earliest: 100, latest: 200 };
  const colours = themedColours(state.config);

  it("uses the visualisation's own scale for an ordinary file", () => {
    expect(fillOf(state, createdAt("a.ts", 150))).toBe(SCALE_COLOUR);
  });

  it("falls back to the neutral colour when the visualisation has no value", () => {
    expect(fillOf(state, createdAt("valueless", 150))).toBe(
      colours.neutralColour
    );
  });

  // Scrubbing the date range back before a file existed shouldn't colour it as though it did.
  it("marks a file not yet created at the end of the range as nonexistent", () => {
    expect(fillOf(state, createdAt("future.ts", 500))).toBe(
      colours.nonexistentColour
    );
  });

  // This is what makes nested circles legible: a circle's own fill is the background its children
  // are drawn on top of. It applies at *every* depth, not just the top level - in a nestedCircles
  // layout the same rule has to hold for a circle nested three deep.
  it.each(["circlePack", "nestedCircles"] as const)(
    "paints a %s node as the circle-pack background whatever its depth",
    (algorithm) => {
      const nested = minimalDirectoryNode("group", "group", [], {
        layout: { algorithm },
      });
      expect(fillOf(state, nested)).toBe(colours.circlePackBackground);
    }
  );

  // ...and the override wins over the scale, so a circle never takes a data colour of its own.
  it("prefers the circle background over a value the visualisation could have supplied", () => {
    const circle = minimalDirectoryNode("has-a-value", "has-a-value", [], {
      layout: { algorithm: "circlePack" },
    });
    expect(fillOf(state, circle)).not.toBe(SCALE_COLOUR);
  });
});
