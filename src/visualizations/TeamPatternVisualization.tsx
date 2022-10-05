import { HierarchyNode } from "d3";

import { FeatureFlags, FileNode } from "../polyglot_data.types";
import {
  Action,
  PatternId,
  sortTeamsByName,
  State,
  themedColours,
} from "../state";
import { TeamExtraControls } from "../VisualizationData";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class TeamPatternVisualization extends BaseVisualization<PatternId> {
  scale: (v: PatternId) => string | undefined = (v) => `url(#pattern${v})`;

  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
  }
  dataFn(d: HierarchyNode<FileNode>): PatternId | undefined {
    const { svgPatternLookup } = this.state.calculated.svgPatterns;
    return svgPatternLookup.get(d.data.path);
  }
  parentFn(): PatternId | undefined {
    // TODO: implement this!
    return undefined;
  }

  colourKey(): [string, string][] {
    const { teams } = this.state.config.teamsAndAliases;
    const teamColours: [string, string][] = [...teams]
      .filter(([, team]) => !team.hidden)
      .sort(sortTeamsByName)
      .map(([name, team]) => [name, team.colour]);
    if (this.state.config.teamVisualisation.showNonTeamChanges) {
      return [
        [
          "Users with no team",
          themedColours(this.state.config).teams.noTeamColour,
        ],
        ...teamColours,
      ];
    } else {
      return teamColours;
    }
  }
  extraControls() {
    if (this.dispatch) {
      return (
        <TeamExtraControls
          state={this.state}
          dispatch={this.dispatch}
        ></TeamExtraControls>
      );
    }
    return undefined;
  }
}
