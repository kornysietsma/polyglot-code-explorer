import { HierarchyNode } from "d3";

import { numberOfChangersKeyData } from "../colourKeys";
import { numberOfChangersScale } from "../ColourScales";
import { nodeNumberOfChangers } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class NumberOfChangersVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = numberOfChangersScale(state);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { aliases, ignoredUsers } = this.state.config.teamsAndAliases;
    return nodeNumberOfChangers(
      d.data,
      aliases,
      ignoredUsers,
      earliest,
      latest
    );
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return numberOfChangersKeyData(this.scale, this.state);
  }
}
