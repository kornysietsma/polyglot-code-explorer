/* eslint-disable react/forbid-prop-types */
import React, { useReducer } from "react";
import PropTypes from "prop-types";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import { globalDispatchReducer, initialiseGlobalState } from "./State";

const App = (props) => {
  // eslint-disable-next-line react/prop-types
  const { dataRef } = props;

  const [vizState, dispatch] = useReducer(
    globalDispatchReducer,
    dataRef,
    initialiseGlobalState
  );

  return (
    <div className="App">
      <header className="App-header">
        <h1>Polyglot Code Explorer (beta)</h1>
      </header>
      <Viz dataRef={dataRef} state={vizState} dispatch={dispatch} />
      <Controller dataRef={dataRef} state={vizState} dispatch={dispatch} />
      <Inspector dataRef={dataRef} state={vizState} dispatch={dispatch} />
    </div>
  );
};

App.propTypes = {
  dataRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
};

export default App;
