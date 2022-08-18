import { Action, State } from "./state";
import { VizDataRef } from "./viz.types";

export type DefaultProps = {
  dataRef: VizDataRef;
  state: State;
  dispatch: React.Dispatch<Action>;
};
