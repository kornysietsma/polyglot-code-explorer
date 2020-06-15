import _ from "lodash";

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

function setIndentationMetric(state, metric) {
  const result = _.cloneDeep(state);
  switch (metric) {
    case "sum":
      _.set(result, ["config", "indentation"], {
        metric: "sum",
        bad: 10000,
        good: 0,
        ugly: 100000,
        precision: 0
      });
      break;
    case "p99":
      _.set(result, ["config", "indentation"], {
        metric: "p99",
        bad: 30,
        good: 0,
        ugly: 80,
        precision: 0
      });
      break;
    case "stddev":
      _.set(result, ["config", "indentation"], {
        metric: "stddev",
        bad: 10,
        good: 3,
        ugly: 20,
        precision: 2
      });
      break;
    default:
      throw Error(`Invalid metric: ${metric}`);
  }
  return result;
}


function initialiseGlobalState(initialData) {
  const { maxDepth, maxLoc } = findDataStats(initialData);
  let defaults = {
    config: {
      visualization: "language",
      loc: {
        bad: 1000,
        good: 0,
        ugly: 10000,
        precision: 0 // number of float digits to show
      },
      indentation: {
        note: "overridden later!"
      },
      age: {
        bad: 365,
        good: 0,
        ugly: 365 * 4,
        maxAge: 365 * 2,
        precision: 0
      },
      colours: {
        defaultStroke: "#111111",
        selectedStroke: "#fffa00",
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
  defaults = setIndentationMetric(defaults, "sum");
  return defaults;
}

function globalDispatchReducer(state, action) {
  const { expensiveConfig, config } = state;
  switch (action.type) {
    case "setVisualization":
      return { ...state, config: { ...config, visualization: action.payload } };
    case "setIndentationMetric": {
      const result = _.cloneDeep(state);
      _.set(result, ["config", "indentation", "metric"], action.payload);
      return setIndentationMetric(state, action.payload);
    }
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
