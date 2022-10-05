import { HierarchyNode } from "d3";
import { ReactElement } from "react";

import { nodeLanguage } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class LanguageVisualization extends BaseVisualization<string> {
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
  }
  dataFn(d: HierarchyNode<FileNode>): string {
    return nodeLanguage(d.data);
  }
  parentFn(): string | undefined {
    return undefined;
  }

  scale = (v: string) => this.metadata.languages.languageMap.get(v)?.colour;

  colourKey(): [string, string][] {
    const { languageKey, otherColour } = this.metadata.languages;
    return [
      ...languageKey.map((k) => [k.language, k.colour] as [string, string]),
      ["Other languages", otherColour],
    ];
  }

  extraControls(): ReactElement | undefined {
    {
      return undefined;
    }
  }
}
