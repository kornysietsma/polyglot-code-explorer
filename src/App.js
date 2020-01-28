import React, { useReducer, useRef } from "react";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import rawData from "./data/flare.json";

// TODO - should move init and reducer so App doesn't care about the details
function init(initialData) {
  return {
    config: {
      scale: 100 // percent to make life easier
    },
    expensiveConfig: {
      shapeCount: initialData.length,
      strength: 13 // actually negative
    }
  };
}

function reducer(state, action) {
  console.log("dispatched:", action);
  const {
    expensiveConfig,
    expensiveConfig: { shapeCount }
  } = state;
  console.log("old state", state);
  switch (action.type) {
    case "addShape": {
      const newState = {
        ...state,
        expensiveConfig: { ...expensiveConfig, shapeCount: shapeCount + 1 }
      };
      console.log("new state:", newState);
      return newState;
    }
    case "setScale":
      return { ...state, config: { scale: action.payload } };
    case "setStrength":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, strength: action.payload }
      };
    default:
      throw new Error();
  }
}

function App() {
  const [vizState, dispatch] = useReducer(reducer, rawData, init);
  const data = useRef(rawData);

  console.log("app constructor with state:", vizState);

  return (
    <div className="App">
      <header className="App-header">
        <h1>LATI Code Visualizer</h1>
      </header>
      <Viz data={data} state={vizState} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector />
    </div>
  );
}

export default App;
