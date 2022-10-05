import { HierarchyNode, interpolatePlasma, scaleSequential } from "d3";

import { depthKey } from "../colourKeys";
import { nodeDepth } from "../nodeData";
import { DirectoryNode, FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class NestingDepthVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    const { maxDepth } = this.metadata.stats;
    this.scale = scaleSequential(interpolatePlasma)
      .domain([0, maxDepth])
      .clamp(true);
  }
  dataFn(d: HierarchyNode<FileNode>): number {
    return nodeDepth(d);
  }
  parentFn(d: HierarchyNode<DirectoryNode>): number | undefined {
    return nodeDepth(d);
  }

  colourKey(): [string, string][] {
    return depthKey(this.scale, this.state, this.metadata);
  }
}
