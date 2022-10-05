import { HierarchyNode } from "d3";
import { useId } from "react";

import { singleTeamColourScaleKey } from "../colourKeys";
import { singleTeamScale } from "../ColourScales";
import { nodeSingleTeam } from "../nodeData";
import { FeatureFlags, FileNode } from "../polyglot_data.types";
import { Action, State, themedColours } from "../state";
import { VizMetadata } from "../viz.types";
import { ColourPicker } from "../widgets/ColourPicker";
import DelayedInputRange from "../widgets/DelayedInputRange";
import { FileChangeMetricChooser } from "../widgets/FileChangeMetricChooser";
import { BaseVisualization } from "./BaseVisualization";

export const SingleTeamExtraControls = ({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) => {
  const teamSelectionId = useId();
  const showLevelAsLightnessId = useId();
  return (
    <div>
      <label htmlFor={teamSelectionId}>
        Select team:
        <select
          id={teamSelectionId}
          value={state.config.teamVisualisation.selectedTeam ?? ""}
          onChange={(evt) => {
            dispatch({
              type: "selectTeam",
              payload: evt.target.value,
            });
          }}
        >
          <option key="" value="">
            Please choose a team
          </option>
          {[...state.config.teamsAndAliases.teams.keys()]
            .sort()
            .map((teamName) => (
              <option key={teamName} value={teamName}>
                {teamName}
              </option>
            ))}
        </select>
      </label>
      <div>
        <label>
          This team:
          <ColourPicker
            colour={themedColours(state.config).teams.selectedTeamColour}
            onChange={(newColour: string) => {
              dispatch({
                type: "setColour",
                payload: { name: "teams.selectedTeamColour", value: newColour },
              });
            }}
          ></ColourPicker>
        </label>
        <label>
          {" "}
          Other users:
          <ColourPicker
            colour={themedColours(state.config).teams.otherUsersColour}
            onChange={(newColour: string) => {
              dispatch({
                type: "setColour",
                payload: { name: "teams.otherUsersColour", value: newColour },
              });
            }}
          ></ColourPicker>
        </label>
      </div>
      <div>
        Use lightness to show amount of change?&nbsp;
        <label htmlFor={showLevelAsLightnessId}>
          <input
            type="checkbox"
            id={showLevelAsLightnessId}
            checked={state.config.teamVisualisation.showLevelAsLightness}
            onChange={(evt) => {
              dispatch({
                type: "setShowLevelAsLightness",
                payload: evt.target.checked,
              });
            }}
          />
        </label>
      </div>
      {state.config.teamVisualisation.showLevelAsLightness ? (
        <DelayedInputRange
          value={state.config.teamVisualisation.lightnessCap * 100}
          minValue={1}
          maxValue={100}
          label={"Lightness Cap:"}
          onChange={(oldValue: number, newValue: number) => {
            dispatch({
              type: "setLightnessCap",
              payload: newValue / 100,
            });
          }}
          postLabel={(value: number) => `${Math.trunc(value)}%`}
        ></DelayedInputRange>
      ) : (
        <></>
      )}
      <FileChangeMetricChooser state={state} dispatch={dispatch} />
    </div>
  );
};

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
