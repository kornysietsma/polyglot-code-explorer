import React, { useReducer, useRef } from "react";
import "./App.css";
import Controller from "./Controller";
import Inspector from "./Inspector";
import Viz from "./Viz";
import rawData from "./data/flare.json";

function findNodeStats(node, nodeDepth, maxDepthSoFar, maxLocSoFar) {
  let myLoc = node.children ? 0 : node.value; // only counting lines of actual files!
  if (myLoc < maxLocSoFar) myLoc = maxLocSoFar;
  let myDepth = nodeDepth > maxDepthSoFar ? nodeDepth : maxDepthSoFar;
  if (node.children) {
    const childStats = node.children.reduce(
      (memo, child) => {
        let { loc, depth } = memo;
        const { maxDepth, maxLoc } = findNodeStats(
          child,
          nodeDepth + 1,
          depth,
          loc
        );
        if (maxDepth > depth) depth = maxDepth;
        if (maxLoc > loc) loc = maxLoc;
        return { loc, depth };
      },
      { loc: myLoc, depth: myDepth }
    );
    myLoc = childStats.loc;
    myDepth = childStats.depth;
  }
  return { maxDepth: myDepth, maxLoc: myLoc };
}

function findDataStats(initialData) {
  return findNodeStats(initialData, 0, 0, 0);
}

// TODO - should move init and reducer so App doesn't care about the details
function init(initialData) {
  const { maxDepth, maxLoc } = findDataStats(initialData);
  return {
    config: {
      visualization: "loc",
      cheapThing: 5
    },
    expensiveConfig: {
      depth: 10,
      expensiveThing: 5
    },
    nonD3Config: {
      selectedNode: null
    },
    stats: {
      maxDepth,
      maxLoc
    }
  };
}

function reducer(state, action) {
  console.log("dispatched:", action);
  const {
    expensiveConfig,
    expensiveConfig: { expensiveThing },
    config,
    nonD3Config
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
    case "setVisualization":
      return { ...state, config: { ...config, visualization: action.payload } };
    case "setCheap":
      return { ...state, config: { ...config, cheapThing: action.payload } };
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
    case "selectNode":
      return {
        ...state,
        nonD3Config: { ...nonD3Config, selectedNode: action.payload }
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
      <Viz data={data} state={vizState} dispatch={dispatch} />
      <Controller data={data} state={vizState} dispatch={dispatch} />
      <Inspector state={vizState} dispatch={dispatch} />
    </div>
  );
}

export default App;
