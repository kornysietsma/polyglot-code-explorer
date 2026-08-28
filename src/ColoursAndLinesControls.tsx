import React from "react";
import {
  Button,
  Group,
  Input,
  Label,
  NumberField,
} from "react-aria-components";

import { DefaultProps } from "./components.types";
import { themedColours } from "./state";
import { ColourPicker } from "./widgets/ColourPicker";
import ToggleablePanel from "./widgets/ToggleablePanel";

const LineWidthField = (props: {
  label: string;
  defaultValue: number;
  onChange: (newWidth: number) => void;
}) => (
  <NumberField
    defaultValue={props.defaultValue}
    step={1}
    minValue={0}
    maxValue={20}
    onChange={(newWidth) => props.onChange(newWidth || 1)}
  >
    <Label>{props.label}</Label>
    <Group>
      <Button slot="decrement">−</Button>
      <Input />
      <Button slot="increment">+</Button>
    </Group>
  </NumberField>
);

const ColoursAndLinesControls = (props: DefaultProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dataRef, state, dispatch } = props;

  const basePayload = () => {
    return {
      nestedWidths: [...state.config.nesting.nestedWidths] as [
        number,
        number,
        number,
        number,
      ],
      defaultWidth: state.config.nesting.defaultWidth,
      nestedStrokes: [...themedColours(state.config).nestedStrokes] as [
        string,
        string,
        string,
        string,
      ],
      defaultStroke: themedColours(state.config).defaultStroke,
    };
  };

  return (
    <ToggleablePanel title="Colours and Lines" showInitially={false}>
      <div>
        <LineWidthField
          label="Default line width"
          defaultValue={state.config.nesting.defaultWidth}
          onChange={(newWidth) =>
            dispatch({
              type: "setLines",
              payload: { ...basePayload(), defaultWidth: newWidth },
            })
          }
        />
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
        <LineWidthField
          label="Top level width"
          defaultValue={state.config.nesting.nestedWidths[0]}
          onChange={(newWidth) => {
            const payload = basePayload();
            payload.nestedWidths[0] = newWidth;
            dispatch({
              type: "setLines",
              payload,
            });
          }}
        />
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
        <LineWidthField
          label="2nd level width"
          defaultValue={state.config.nesting.nestedWidths[1]}
          onChange={(newWidth) => {
            const payload = basePayload();
            payload.nestedWidths[1] = newWidth;
            dispatch({
              type: "setLines",
              payload,
            });
          }}
        />
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
        <LineWidthField
          label="3rd level width"
          defaultValue={state.config.nesting.nestedWidths[2]}
          onChange={(newWidth) => {
            const payload = basePayload();
            payload.nestedWidths[2] = newWidth;
            dispatch({
              type: "setLines",
              payload,
            });
          }}
        />
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
      <div>
        <LineWidthField
          label="4th level width"
          defaultValue={state.config.nesting.nestedWidths[3]}
          onChange={(newWidth) => {
            const payload = basePayload();
            payload.nestedWidths[3] = newWidth;
            dispatch({
              type: "setLines",
              payload,
            });
          }}
        />
        <label>
          Colour:
          <ColourPicker
            colour={themedColours(state.config).nestedStrokes[3]}
            onChange={(newColour: string) => {
              const payload = basePayload();
              payload.nestedStrokes[3] = newColour;
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
