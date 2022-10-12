import { HierarchyNode } from "d3";

import { goodBadUglyColourKeyData } from "../colourKeys";
import { goodBadUglyScale } from "../ColourScales";
import { nodeCumulativeLinesOfCode } from "../nodeData";
import { DirectoryNode, FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class LinesOfCodeVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = goodBadUglyScale(state.config, state.config.loc);
  }
  dataFn(d: HierarchyNode<FileNode>): number {
    return nodeCumulativeLinesOfCode(d.data);
  }
  parentFn(d: HierarchyNode<DirectoryNode>): number {
    return nodeCumulativeLinesOfCode(d.data);
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.loc
    );
  }
}
