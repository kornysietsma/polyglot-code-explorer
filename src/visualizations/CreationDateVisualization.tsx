import { HierarchyNode } from "d3";

import { creationKeyData } from "../colourKeys";
import { earlyLateScaleBuilder } from "../ColourScales";
import { nodeCreationDateClipped } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class CreationDateVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  features: FeatureFlags;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = earlyLateScaleBuilder(state);
    this.features = features;
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    if (earliest && latest) {
      return nodeCreationDateClipped(d.data, this.features, earliest, latest);
    }
    return undefined;
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return creationKeyData(this.scale, this.state);
  }
}
