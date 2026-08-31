import { color } from "d3";
import { describe, expect, it } from "vitest";

import { CouplingLink } from "../model/coupling";
import { CouplingBucket, TreeNode } from "../polyglot_data.types";
import { State } from "../state";
import { themedColours } from "../state/colours";
import {
  minimalDirectoryNode,
  minimalFileNode,
  minimalState,
} from "../testFixtures";
import {
  arcPath,
  couplingArcLabel,
  couplingArcPath,
  couplingArcStroke,
  couplingArcWidth,
  normalizedCouplingNodes,
} from "./couplingArcs";

function bucket(
  coupled_files: [string, number][],
  { activity_bursts = 10, bucket_start = 0, bucket_end = 1000 } = {}
): CouplingBucket {
  return { activity_bursts, bucket_start, bucket_end, coupled_files };
}

function coupledFile(path: string, buckets: CouplingBucket[]) {
  return minimalFileNode(path, path, { data: { coupling: { buckets } } });
}

// A source file coupled to two others, inside a state whose filters let everything through.
function stateWith(overrides: Partial<State["couplingConfig"]> = {}): State {
  const state = minimalState();
  return {
    ...state,
    config: {
      ...state.config,
      filters: {
        ...state.config.filters,
        dateRange: { earliest: 0, latest: 1000 },
      },
    },
    couplingConfig: {
      ...state.couplingConfig,
      shown: true,
      minBursts: 0,
      minRatio: 0,
      maxCommonRoots: -1,
      ...overrides,
    },
  };
}

function link(overrides: Partial<CouplingLink> = {}): CouplingLink {
  return {
    source: minimalFileNode("a.js", "src/a.js"),
    targetFile: "src/b.js",
    sourceCount: 10,
    targetCount: 5,
    ...overrides,
  };
}

describe("normalizedCouplingNodes", () => {
  const tree: TreeNode = minimalDirectoryNode("root", "", [
    coupledFile("src/a.js", [bucket([["src/b.js", 9]])]),
    coupledFile("test/c.js", [bucket([["src/a.js", 2]])]),
    // no coupling data at all - the common case, and must not contribute a link
    minimalFileNode("src/b.js", "src/b.js"),
  ]);

  it("flattens every coupled pair in the tree into one list of links", () => {
    expect(
      normalizedCouplingNodes(tree, stateWith()).map((l) => [
        l.source.path,
        l.targetFile,
        l.targetCount,
        l.sourceCount,
      ])
    ).toEqual([
      ["src/a.js", "src/b.js", 9, 10],
      ["test/c.js", "src/a.js", 2, 10],
    ]);
  });

  it("draws nothing at all when coupling is switched off", () => {
    expect(normalizedCouplingNodes(tree, stateWith({ shown: false }))).toEqual(
      []
    );
  });

  it("passes the coupling controls' thresholds through to the filter", () => {
    // 9/10 gets through a 0.5 ratio; 2/10 does not
    expect(
      normalizedCouplingNodes(tree, stateWith({ minRatio: 0.5 })).map(
        (l) => l.source.path
      )
    ).toEqual(["src/a.js"]);
    // "src/a.js" -> "src/b.js" shares one leading directory, so a limit of 0 drops it
    expect(
      normalizedCouplingNodes(tree, stateWith({ maxCommonRoots: 0 })).map(
        (l) => l.source.path
      )
    ).toEqual(["test/c.js"]);
  });

  it("uses the display date range, not the coupling config's own", () => {
    const state = stateWith();
    const outOfRange: State = {
      ...state,
      config: {
        ...state.config,
        filters: {
          ...state.config.filters,
          dateRange: { earliest: 5000, latest: 6000 },
        },
      },
    };
    expect(normalizedCouplingNodes(tree, outOfRange)).toEqual([]);
  });
});

describe("arcPath", () => {
  // A quarter-circle's worth of separation: dx=3, dy=4, so the radius is 5.
  const source: [number, number] = [0, 0];
  const target: [number, number] = [3, 4];

  it("arcs from source to target with a radius equal to their distance", () => {
    expect(arcPath(true, source, target)).toBe("M0,0A5, 5 0, 0, 0 3,4");
  });

  it("swaps the ends and the sweep flag for a right-handed arc, so it bows the other way", () => {
    expect(arcPath(false, source, target)).toBe("M3,4A5, 5 0, 0, 1 0,0");
  });
});

describe("couplingArcPath", () => {
  const source = minimalFileNode("a.js", "src/a.js", {
    layout: { center: [0, 0] },
  });
  const target = minimalFileNode("b.js", "src/b.js", {
    layout: { center: [3, 4] },
  });

  it("looks the target up by path, since the link only stores its name", () => {
    const nodesByPath = new Map([["src/b.js", target as TreeNode]]);
    expect(couplingArcPath(link({ source }), nodesByPath)).toBe(
      "M0,0A5, 5 0, 0, 0 3,4"
    );
  });

  it("throws rather than drawing a broken arc when the target is not in the tree", () => {
    expect(() => couplingArcPath(link({ source }), new Map())).toThrow(
      "Can't find source or target for coupling line"
    );
  });
});

describe("arc styling", () => {
  const { config } = minimalState();

  it("fades the arc by how strongly the two files are coupled", () => {
    const themed = color(themedColours(config).couplingStroke)!;
    // a pair that has never changed apart is the theme colour, fully opaque
    expect(couplingArcStroke(link({ targetCount: 10 }), config)).toBe(
      themed.toString()
    );
    const weak = color(couplingArcStroke(link({ targetCount: 2 }), config))!;
    expect(weak.opacity).toBeCloseTo(0.2);
    expect(weak.formatHex()).toBe(themed.formatHex());
  });

  it.each([
    [10, "3px"],
    [9.5, "3px"],
    [9, "2px"],
    [8.1, "2px"],
    [8, "1px"],
    [1, "1px"],
  ])("draws a %d/10 coupling %s wide", (targetCount, width) => {
    expect(couplingArcWidth(link({ targetCount }))).toBe(width);
  });

  it("labels an arc with both paths and the ratio", () => {
    expect(couplingArcLabel(link())).toBe("src/a.js -> src/b.js (0.500)");
  });
});
