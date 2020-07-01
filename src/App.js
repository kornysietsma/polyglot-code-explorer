/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useReducer, useRef } from "react";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { globalDispatchReducer, initialiseGlobalState } from "./State";

const App = props => {
  // eslint-disable-next-line react/prop-types
  const { rawData, metadata } = props;

  const [vizState, dispatch] = useReducer(
    globalDispatchReducer,
    { rawData, metadata },
    initialiseGlobalState
  );
  const data = useRef({ metadata, files: rawData });

  return (
    <div className="App">
      <header className="App-header">
        <h1>Polyglot Code Explorer (beta)</h1>
      </header>
      <Viz data={data} state={vizState} dispatch={dispatch} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector metadata={metadata} state={vizState} dispatch={dispatch} />
    </div>
  );
};

export default App;
