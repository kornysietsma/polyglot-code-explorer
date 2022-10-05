import { HierarchyNode } from "d3";

import { goodBadUglyColourKeyData } from "../colourKeys";
import { goodBadUglyScale } from "../ColourScales";
import { nodeChurnCommits, nodeChurnDays, nodeChurnLines } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export type ChurnMetric = "days" | "commits" | "lines";

export class ChurnVisualization extends BaseVisualization<number> {
  metric: ChurnMetric;
  scale: (v: number) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined,
    metric: ChurnMetric
  ) {
    super(state, metadata, features, dispatch);
    this.metric = metric;
    this.scale = goodBadUglyScale(state.config, state.config.churn[metric]);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { ignoredUsers } = this.state.config.teamsAndAliases;

    switch (this.metric) {
      case "days":
        return nodeChurnDays(d.data, ignoredUsers, earliest, latest);
      case "commits":
        return nodeChurnCommits(d.data, ignoredUsers, earliest, latest);
      case "lines":
        return nodeChurnLines(d.data, ignoredUsers, earliest, latest);
    }
  }
  parentFn(): number | undefined {
    return undefined;
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.churn[this.metric]
    );
  }
}
