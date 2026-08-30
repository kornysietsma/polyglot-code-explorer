import { HierarchyNode } from "d3";

import { goodBadUglyColourKeyData } from "../colourKeys";
import { goodBadUglyScale } from "../ColourScales";
import { nodeIndentation } from "../model/nodeAccessors";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { State } from "../state";
import { Action } from "../state/actions";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

type IndentationMetric = "sum" | "p99" | "stddev";

export class IndentationVisualization extends BaseVisualization<number> {
  metric: IndentationMetric;
  scale: (v: number) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined,
    metric: IndentationMetric
  ) {
    super(state, metadata, features, dispatch);
    this.metric = metric;
    this.scale = goodBadUglyScale(
      state.config,
      state.config.indentation[metric]
    );
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    return nodeIndentation(d.data, this.metric);
  }
  parentFn(): number | undefined {
    return undefined;
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.indentation[this.metric]
    );
  }
}
