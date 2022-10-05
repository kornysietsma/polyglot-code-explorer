import { useReducer, useRef } from "react";

import Controller from "./Controller";
import Inspector from "./inspectors/Inspector";
import Messages from "./Messages";
import { globalDispatchReducer, initialiseGlobalState } from "./state";
import Viz from "./Viz";
import { VizDataRef, VizDataRefMaybe } from "./viz.types";

/**
 * The main App component - note, this should be loaded from a `<Loader>` which handles fetching data first!
 * @param dataRefMaybe - the data to view, by the time App is rendered the data should be loaded so cannot be undefined.  (sadly due to the way hooks work I can't check this in `Loader`)
 */
const App = ({ dataRefMaybe }: { dataRefMaybe: VizDataRefMaybe }) => {
  // The App can only be shown if the data ref has been loaded - see Loader.tsx - so this is safe
  const dataRef: VizDataRef = useRef(dataRefMaybe.current!);

  const [vizState, dispatch] = useReducer(
    globalDispatchReducer(dataRef),
    dataRef,
    initialiseGlobalState
  );

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
