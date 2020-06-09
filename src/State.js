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

function initialiseGlobalState(initialData) {
  const { maxDepth, maxLoc } = findDataStats(initialData);
  return {
    config: {
      visualization: "language",
      loc: {
        bad: 1000,
        good: 0,
        ugly: 10000,
      },
      indentation: {
        metric: "p90",
        summarizeBy: "worst",
        bad: 40,
        good: 0,
        ugly: 80,
        maxIndentationScale: 50
      },
      age: {
        bad: 365,
        good: 0,
        ugly: 365*4,
        maxAge: 365 * 2
      },
      colours: {
        defaultStroke: "#111111",
        selectedStroke: "#aaa500",
        goodColour: "blue",
        badColour: "red",
        uglyColour: "yellow",
        neutralColour: "#808080",
        circlePackBackground: "#111111"
      },
      selectedNode: null
    },
    expensiveConfig: {
      depth: Math.min(8, maxDepth)
    },
    stats: {
      maxDepth,
      maxLoc: Math.min(maxLoc, 2000)
    }
  };
}

function globalDispatchReducer(state, action) {
  console.log("dispatched:", action);
  const { expensiveConfig, config } = state;
  console.log("old state", state);
  switch (action.type) {
    case "setVisualization":
      return { ...state, config: { ...config, visualization: action.payload } };
    case "setDepth":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, depth: action.payload }
      };
    case "selectNode":
      return {
        ...state,
        config: { ...config, selectedNode: action.payload }
      };
    default:
      throw new Error();
  }
}

export { initialiseGlobalState, globalDispatchReducer };
