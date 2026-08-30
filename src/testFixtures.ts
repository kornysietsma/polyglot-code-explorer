// Minimal fixtures shared by the unit tests. Real data files carry far more than any single test
// needs, so these build the smallest thing the types allow and let each caller override just the
// parts it exercises.

import {
  DirectoryNode,
  FeatureFlags,
  FileData,
  FileNode,
  GitData,
  GitDetails,
  LocData,
  NodeLayout,
  PolyglotData,
  SUPPORTED_FILE_VERSION,
  TreeNode,
} from "./polyglot_data.types";
import { indexUsersById } from "./preprocess";
import { State } from "./state";
import { initialiseGlobalState } from "./state/config";
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

export interface MinimalNodeOptions {
  // Merged over an empty voronoi layout, so a test can supply only `polygon`, only `center`, or
  // both.
  layout?: Partial<NodeLayout>;
  // Left absent unless given: `nodeCircleAncestors` throws on a missing value rather than
  // defaulting, so tests that don't set it should see that failure too.
  circleAncestors?: number;
}

export interface MinimalFileNodeOptions extends MinimalNodeOptions {
  // Merged over `{ loc: DUMMY_LOC }`, for the tests that care about git, coupling or file_stats.
  data?: Partial<FileData>;
}

export function minimalFileNode(
  name: string,
  path: string,
  { layout, circleAncestors, data }: MinimalFileNodeOptions = {}
): FileNode {
  return {
    name,
    path,
    layout: { algorithm: "voronoi", center: [0, 0], polygon: [], ...layout },
    value: 0,
    ...(circleAncestors === undefined ? {} : { circleAncestors }),
    data: { loc: DUMMY_LOC, ...data },
  };
}

export function minimalDirectoryNode(
  name: string,
  path: string,
  children: TreeNode[],
  { layout, circleAncestors }: MinimalNodeOptions = {}
): DirectoryNode {
  return {
    name,
    path,
    layout: { algorithm: "voronoi", center: [0, 0], polygon: [], ...layout },
    value: 0,
    ...(circleAncestors === undefined ? {} : { circleAncestors }),
    children,
  };
}

// A `GitData` with no history at all. `details` is what nearly every test then fills in - it is
// empty here rather than absent because that is the shape a `git_details`-disabled scan produces.
export function minimalGitData(details: GitDetails[] = []): GitData {
  return {
    last_update: 0,
    age_in_days: 0,
    user_count: 0,
    users: [],
    details,
    activity: [],
  };
}

// One day's changes by one or more users. Defaults keep a test's fixture down to the fields it
// actually asserts on - usually the day and the users.
export function gitDetails(
  commit_day: number,
  users: number[],
  { commits = 1, lines_added = 1, lines_deleted = 1 } = {}
): GitDetails {
  return { commit_day, users, commits, lines_added, lines_deleted };
}

export function minimalPolyglotData(
  tree: TreeNode,
  features: Partial<FeatureFlags> = {}
): PolyglotData {
  return {
    name: "test",
    id: "test",
    version: SUPPORTED_FILE_VERSION,
    metadata: { git: { users: [] } },
    features: {
      git: false,
      coupling: false,
      git_details: false,
      file_stats: false,
      ...features,
    },
    tree,
  };
}

// The postprocessed metadata `Loader.tsx` builds. `users` is the field most tests override,
// since it is what teams and aliases resolve against.
export function vizMetadata(overrides: Partial<VizMetadata> = {}): VizMetadata {
  const metadata: VizMetadata = {
    languages: {
      languageKey: [],
      languageMap: new Map(),
      otherColour: "#111111",
    },
    stats: { maxDepth: 1, maxLoc: 1 },
    users: [],
    usersById: new Map(),
    nodesByPath: new Map(),
    timescaleData: [],
    ...overrides,
  };
  // Derive the index from whatever `users` the caller supplied, so a test that overrides the
  // user list doesn't also have to hand-build a matching map - and gets the same density check
  // the real Loader applies.
  return {
    ...metadata,
    usersById: overrides.usersById ?? indexUsersById(metadata.users),
  };
}

// The real default `State`, built the way App.tsx builds it. Going through
// `initialiseGlobalState` rather than hand-writing a Config keeps tests honest about the shape:
// a new config field can't be silently missed here. `initialiseGlobalState` reads only the
// handful of fields set below.
export function minimalState(): State {
  const data: PolyglotData = minimalPolyglotData(minimalFileNode("root", ""));
  const vizData: VizData = { data, metadata: vizMetadata() };
  const dataRef: VizDataRef = { current: vizData };
  return initialiseGlobalState(dataRef);
}
