import { HierarchyNode } from "d3";

import { singleTeamColourScaleKey } from "../colourKeys";
import { singleTeamScale } from "../ColourScales";
import { nodeSingleTeam } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State } from "../state";
import { SingleTeamExtraControls } from "../VisualizationData";
import { VizMetadata } from "../viz.types";
import { BaseVisualization } from "./BaseVisualization";

// The key of SingleTeamVisualisation is [own count, other count]
export class SingleTeamVisualization extends BaseVisualization<
  [number, number]
> {
  scale: (v: [number, number]) => string | undefined;
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    super(state, metadata, features, dispatch);
    this.scale = singleTeamScale(state);
  }
  dataFn(d: HierarchyNode<FileNode>): [number, number] | undefined {
    const { aliases, ignoredUsers } = this.state.config.teamsAndAliases;
    const { userTeams } = this.state.calculated;
    const { earliest, latest } = this.state.config.filters.dateRange;
    const thisTeam = this.state.config.teamVisualisation.selectedTeam;
    if (thisTeam == undefined) return undefined;
    return nodeSingleTeam(
      d.data,
      thisTeam,
      this.state.config.fileChangeMetric,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest
    );
  }
  parentFn(): [number, number] | undefined {
    // TODO: implement this!
    return undefined;
  }

  colourKey(): [string, string][] {
    return singleTeamColourScaleKey(this.scale, this.state);
  }

  extraControls() {
    if (this.dispatch) {
      return (
        <SingleTeamExtraControls
          state={this.state}
          dispatch={this.dispatch}
        ></SingleTeamExtraControls>
      );
    }
    return undefined;
  }
}
