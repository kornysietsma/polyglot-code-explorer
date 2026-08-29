// Minimal fixtures shared by the unit tests. Real data files carry far more than any single test
// needs, so these build the smallest thing the types allow and let each caller override just the
// parts it exercises.

import {
  FileNode,
  LocData,
  NodeLayout,
  PolyglotData,
} from "./polyglot_data.types";
import { initialiseGlobalState, State } from "./state";
import { VizData, VizDataRef, VizMetadata } from "./viz.types";

export const DUMMY_LOC: LocData = {
  language: "test",
  binary: false,
  blanks: 1,
  code: 2,
  comments: 3,
  lines: 4,
  bytes: 5,
};

export interface MinimalFileNodeOptions {
  // Merged over an empty voronoi layout, so a test can supply only `polygon`, only `center`, or
  // both.
  layout?: Partial<NodeLayout>;
  // Left absent unless given: `nodeCircleAncestors` throws on a missing value rather than
  // defaulting, so tests that don't set it should see that failure too.
  circleAncestors?: number;
}

export function minimalFileNode(
  name: string,
  path: string,
  { layout, circleAncestors }: MinimalFileNodeOptions = {}
): FileNode {
  return {
    name,
    path,
    layout: { algorithm: "voronoi", center: [0, 0], polygon: [], ...layout },
    value: 0,
    ...(circleAncestors === undefined ? {} : { circleAncestors }),
    data: { loc: DUMMY_LOC },
  };
}

// The real default `State`, built the way App.tsx builds it. Going through
// `initialiseGlobalState` rather than hand-writing a Config keeps tests honest about the shape:
// a new config field can't be silently missed here. `initialiseGlobalState` reads only the
// handful of fields set below.
export function minimalState(): State {
  const data: PolyglotData = {
    name: "test",
    id: "test",
    version: "1.0.4",
    metadata: { git: { users: [] } },
    features: {
      git: false,
      coupling: false,
      git_details: false,
      file_stats: false,
    },
    tree: minimalFileNode("root", ""),
  };
  const metadata: VizMetadata = {
    languages: {
      languageKey: [],
      languageMap: new Map(),
      otherColour: "#111111",
    },
    stats: { maxDepth: 1, maxLoc: 1 },
    users: [],
    nodesByPath: new Map(),
    timescaleData: [],
  };
  const vizData: VizData = { data, metadata };
  const dataRef: VizDataRef = { current: vizData };
  return initialiseGlobalState(dataRef);
}
