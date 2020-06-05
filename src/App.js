import React, { useReducer, useRef } from "react";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { initialiseGlobalState, globalDispatchReducer } from "./State";

const App = props => {
  // eslint-disable-next-line react/prop-types
    console.log('in app');
  const { rawData } = props;
  const [vizState, dispatch] = useReducer(
    globalDispatchReducer,
    rawData,
    initialiseGlobalState
  );
  const data = useRef(rawData);

  console.log("app constructor with state:", vizState);

  return (
    <div className="App">
      <header className="App-header">
        <h1>LATI Code Visualizer</h1>
      </header>
      <Viz data={data} state={vizState} dispatch={dispatch} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector state={vizState} dispatch={dispatch} />
    </div>
  );
};

export default App;
