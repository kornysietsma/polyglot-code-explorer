/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useReducer, useRef } from "react";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { globalDispatchReducer, initialiseGlobalState } from "./State";
import {
  countLanguagesIn,
  gatherTimescaleData,
  gatherGlobalStats,
  gatherNodesByPath
} from "./preprocess";

const App = props => {
  // eslint-disable-next-line react/prop-types
  const { rawData } = props;
  console.log("postprocessing languages");
  const languages = countLanguagesIn(rawData);
  console.log("postprocessing global stats");
  const stats = gatherGlobalStats(rawData);
  console.log("building node index");
  const nodesByPath = gatherNodesByPath(rawData);
  console.log("building date scale data");
  const timescaleData = gatherTimescaleData(rawData, "week");
  console.log("postprocessing complete");
  const { users } = rawData.data.git_meta;
  if (rawData.data.coupling_meta) {
    stats.coupling = { ...rawData.data.coupling_meta };
  }
  const metadata = {
    languages,
    stats,
    users,
    nodesByPath,
    timescaleData
  };
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
