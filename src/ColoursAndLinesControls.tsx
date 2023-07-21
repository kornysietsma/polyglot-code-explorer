import React from "react";
import { NumberPicker } from "react-widgets/cjs";

import { DefaultProps } from "./components.types";
import { themedColours } from "./state";
import { ColourPicker } from "./widgets/ColourPicker";
import ToggleablePanel from "./widgets/ToggleablePanel";

const ColoursAndLinesControls = (props: DefaultProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dataRef, state, dispatch } = props;

  const basePayload = () => {
    return {
      nestedWidths: [...state.config.nesting.nestedWidths] as [
        number,
        number,
        number
      ],
      defaultWidth: state.config.nesting.defaultWidth,
      nestedStrokes: [...themedColours(state.config).nestedStrokes] as [
        string,
        string,
        string
      ],
      defaultStroke: themedColours(state.config).defaultStroke,
    };
  };

  return (
    <ToggleablePanel title="Colours and Lines" showInitially={false}>
      <div>
        <label>
          Default line width
          <NumberPicker
            name="default width"
            defaultValue={state.config.nesting.defaultWidth}
            step={1}
            min={0}
            max={20}
            onChange={(newWidth) =>
              dispatch({
                type: "setLines",
                payload: { ...basePayload(), defaultWidth: newWidth || 1 },
              })
            }
          ></NumberPicker>
        </label>
        <label>
          Default line colour:
          <ColourPicker
            colour={themedColours(state.config).defaultStroke}
            onChange={(newColour: string) => {
              dispatch({
                type: "setLines",
                payload: { ...basePayload(), defaultStroke: newColour },
              });
            }}
          ></ColourPicker>
        </label>
      </div>
      <div>
        <label>
          Top level width
          <NumberPicker
            name="default width"
            defaultValue={state.config.nesting.nestedWidths[0]}
            step={1}
            min={0}
            max={20}
            onChange={(newWidth) => {
              const payload = basePayload();
              payload.nestedWidths[0] = newWidth || 1;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></NumberPicker>
        </label>
        <label>
          Colour:
          <ColourPicker
            colour={themedColours(state.config).nestedStrokes[0]}
            onChange={(newColour: string) => {
              const payload = basePayload();
              payload.nestedStrokes[0] = newColour;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></ColourPicker>
        </label>
      </div>
      <div>
        <label>
          2nd level width
          <NumberPicker
            name="default width"
            defaultValue={state.config.nesting.nestedWidths[1]}
            step={1}
            min={0}
            max={20}
            onChange={(newWidth) => {
              const payload = basePayload();
              payload.nestedWidths[1] = newWidth || 1;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></NumberPicker>
        </label>
        <label>
          Colour:
          <ColourPicker
            colour={themedColours(state.config).nestedStrokes[1]}
            onChange={(newColour: string) => {
              const payload = basePayload();
              payload.nestedStrokes[1] = newColour;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></ColourPicker>
        </label>
      </div>
      <div>
        <label>
          3rd level width
          <NumberPicker
            name="default width"
            defaultValue={state.config.nesting.nestedWidths[2]}
            step={1}
            min={0}
            max={20}
            onChange={(newWidth) => {
              const payload = basePayload();
              payload.nestedWidths[2] = newWidth || 1;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></NumberPicker>
        </label>
        <label>
          Colour:
          <ColourPicker
            colour={themedColours(state.config).nestedStrokes[2]}
            onChange={(newColour: string) => {
              const payload = basePayload();
              payload.nestedStrokes[2] = newColour;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          ></ColourPicker>
        </label>
      </div>
    </ToggleablePanel>
  );
};

export default ColoursAndLinesControls;
