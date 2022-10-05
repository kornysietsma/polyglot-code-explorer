import { HierarchyNode } from "d3";

import { goodBadUglyColourKeyData } from "../colourKeys";
import { goodBadUglyScale } from "../ColourScales";
import { nodeAge } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class AgeVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  features: FeatureFlags;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = goodBadUglyScale(state.config, state.config.age);
    this.features = features;
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { ignoredUsers } = this.state.config.teamsAndAliases;

    return nodeAge(d.data, this.features, ignoredUsers, earliest, latest);
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.age
    );
  }
}
