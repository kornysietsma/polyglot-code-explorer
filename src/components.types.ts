import { State } from "./state";
import { Action } from "./state/actions";
import { VizDataRef } from "./viz.types";

export type DefaultProps = {
  dataRef: VizDataRef;
  state: State;
  dispatch: React.Dispatch<Action>;
};
