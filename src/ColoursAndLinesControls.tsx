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

// nestedWidths / nestedStrokes are fixed-length 4-tuples, one entry per nesting level
const NESTING_LEVELS = [
  { index: 0, label: "Top level width" },
  { index: 1, label: "2nd level width" },
  { index: 2, label: "3rd level width" },
  { index: 3, label: "4th level width" },
] as const;

const ColoursAndLinesControls = ({ state, dispatch }: DefaultProps) => {
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
      {NESTING_LEVELS.map(({ index, label }) => (
        <div key={index}>
          <LineWidthField
            label={label}
            defaultValue={state.config.nesting.nestedWidths[index]}
            onChange={(newWidth) => {
              const payload = basePayload();
              payload.nestedWidths[index] = newWidth;
              dispatch({
                type: "setLines",
                payload,
              });
            }}
          />
          <label>
            Colour:
            <ColourPicker
              colour={themedColours(state.config).nestedStrokes[index]}
              onChange={(newColour: string) => {
                const payload = basePayload();
                payload.nestedStrokes[index] = newColour;
                dispatch({
                  type: "setLines",
                  payload,
                });
              }}
            ></ColourPicker>
          </label>
        </div>
      ))}
    </ToggleablePanel>
  );
};

export default ColoursAndLinesControls;
