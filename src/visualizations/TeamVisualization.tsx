import { HierarchyNode } from "d3";

import { teamScale } from "../ColourScales";
import { nodeTopTeam } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, sortTeamsByName, State, themedColours } from "../state";
import { TeamExtraControls } from "../VisualizationData";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

export class TeamVisualization extends BaseVisualization<string> {
  scale: (v: string) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = teamScale(state);
  }
  dataFn(d: HierarchyNode<FileNode>): string | undefined {
    const { aliases, ignoredUsers } = this.state.config.teamsAndAliases;
    const { userTeams } = this.state.calculated;
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { showNonTeamChanges } = this.state.config.teamVisualisation;
    return nodeTopTeam(
      d.data,
      this.state.config.fileChangeMetric,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      showNonTeamChanges
    );
  }
  parentFn(): string | undefined {
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
