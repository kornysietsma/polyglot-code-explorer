import { useId } from "react";

import { Action, State, themedColours } from "../state";
import { ColourPicker } from "../widgets/ColourPicker";
import { FileChangeMetricChooser } from "../widgets/FileChangeMetricChooser";

export const TeamExtraControls = ({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) => {
  const showNonTeamId = useId();
  return (
    <div>
      <div>
        <label htmlFor={showNonTeamId}>
          Show changes by users without a team:&nbsp;
          <input
            type="checkbox"
            id={showNonTeamId}
            checked={state.config.teamVisualisation.showNonTeamChanges}
            onChange={(evt) => {
              dispatch({
                type: "setShowNonTeamChanges",
                payload: evt.target.checked,
              });
            }}
          />
        </label>
      </div>
      {state.config.teamVisualisation.showNonTeamChanges ? (
        <div>
          <label>
            No team colour:
            <ColourPicker
              colour={themedColours(state.config).teams.noTeamColour}
              onChange={(newColour: string) => {
                dispatch({
                  type: "setColour",
                  payload: { name: "teams.noTeamColour", value: newColour },
                });
              }}
            ></ColourPicker>
          </label>
        </div>
      ) : (
        <></>
      )}
      <FileChangeMetricChooser state={state} dispatch={dispatch} />
    </div>
  );
};
