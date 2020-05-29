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
      cheapThing: 5
    },
    expensiveConfig: {
      depth: 10,
      expensiveThing: 5
    }
  };
}

function reducer(state, action) {
  console.log("dispatched:", action);
  const {
    expensiveConfig,
    expensiveConfig: { expensiveThing }
  } = state;
  console.log("old state", state);
  switch (action.type) {
    case "addExpensive": {
      const newState = {
        ...state,
        expensiveConfig: {
          ...expensiveConfig,
          expensiveThing: expensiveThing + 1
        }
      };
      console.log("new state:", newState);
      return newState;
    }
    case "setCheap":
      return { ...state, config: { cheapThing: action.payload } };
    case "setExpensive":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, expensiveThing: action.payload }
      };
    case "setDepth":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, depth: action.payload }
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
