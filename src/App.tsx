import { useReducer, useRef } from "react";

import Controller from "./Controller";
import { stateFromExportable } from "./exportImport";
import Inspector from "./inspectors/Inspector";
import { ExportableStateMaybe } from "./Loader";
import Messages from "./Messages";
import {
  globalDispatchReducer,
  infoMessage,
  initialiseGlobalState,
  warnMessage,
} from "./state";
import Viz from "./Viz";
import { VizDataRef, VizDataRefMaybe } from "./viz.types";

/**
 * The main App component - note, this should be loaded from a `<Loader>` which handles fetching data first!
 * @param dataRefMaybe - the data to view, by the time App is rendered the data should be loaded so cannot be undefined.  (sadly due to the way hooks work I can't check this in `Loader`)
 */
const App = ({
  dataRefMaybe,
  initialStateMaybe,
}: {
  dataRefMaybe: VizDataRefMaybe;
  initialStateMaybe: ExportableStateMaybe;
}) => {
  // The App can only be shown if the data ref has been loaded - see Loader.tsx - so this is safe
  const dataRef: VizDataRef = useRef(dataRefMaybe.current!);

  const [vizState, dispatch] = useReducer(
    globalDispatchReducer(dataRef),
    dataRef,
    initialiseGlobalState
  );

  if (initialStateMaybe.current != undefined) {
    try {
      console.log("Loading initial state");
      const { state, messages } = stateFromExportable(
        dataRef.current.metadata,
        initialStateMaybe.current,
        false
      );
      if (state !== undefined) {
        // we already have messages! Don't want to lose them
        state.messages = [...vizState.messages, ...state.messages];

        if (messages !== undefined && messages.length > 0) {
          state.messages.push(warnMessage("Errors were found and ignored."));
        }
        state.messages.push(infoMessage("Initial state file loaded."));

        dispatch({ type: "setAllState", payload: state });
      } else if (messages !== undefined) {
        console.log("Initial state import failed with messages");

        dispatch({ type: "addMessages", payload: messages });
      } else {
        throw new Error("Logic error  import failed with no messages");
      }
    } finally {
      initialStateMaybe.current = undefined;
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <h3>Polyglot Code Explorer v{process.env.REACT_APP_VERSION}</h3>
        <h1>{dataRef.current.data.name}</h1>
        <h3></h3>
      </header>
      <Messages messages={vizState.messages} dispatch={dispatch} />
      <Viz dataRef={dataRef} state={vizState} dispatch={dispatch} />
      <Controller dataRef={dataRef} state={vizState} dispatch={dispatch} />
      <Inspector dataRef={dataRef} state={vizState} dispatch={dispatch} />
    </div>
  );
};

export default App;
