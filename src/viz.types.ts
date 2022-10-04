import { MutableRefObject } from "react";

import { PolyglotData, TreeNode, UserData } from "./polyglot_data.types";
import { TimescaleIntervalData } from "./preprocess";

export type LanguagesMetadata = {
  languageKey: {
    count: number;
    loc: number;
    language: string;
    colour: string;
  }[];
  languageMap: Map<string, { count: number; loc: number; colour: string }>;
  otherColour: string;
};

export type CouplingStats = {
  bucketCount: number;
  bucketSize: number;
  firstBucketStart: number;
};

export type TreeStats = {
  earliest?: number;
  latest?: number;
  maxDepth: number;
  maxLoc: number;
  coupling?: CouplingStats;
};

export type VizMetadata = {
  languages: LanguagesMetadata;
  stats: TreeStats;
  users: UserData[];
  nodesByPath: Map<string, TreeNode>;
  hierarchyNodesByPath?: Map<string, d3.HierarchyNode<TreeNode>>;
  timescaleData: TimescaleIntervalData[];
};

export type VizData = {
  data: PolyglotData;
  metadata: VizMetadata;
};

// While we are loading the data, it's value might be undefined
export type VizDataRefMaybe = MutableRefObject<VizData | undefined>;
// once Loader.tsx loads `<App>` the value must be defined
export type VizDataRef = MutableRefObject<VizData>;
