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
      visualization: "loc",
      indentation: {
        metric: "p99",
        summarizeBy: "worst",
        maxIndentationScale: 50
      },
      codeAge: {
        maxAge: 365 * 2
      }
    },
    expensiveConfig: {
      depth: Math.min(5, maxDepth)
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

function globalDispatchReducer(state, action) {
  console.log("dispatched:", action);
  const { expensiveConfig, config, nonD3Config } = state;
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
        nonD3Config: { ...nonD3Config, selectedNode: action.payload }
      };
    default:
      throw new Error();
  }
}

export { initialiseGlobalState, globalDispatchReducer };
