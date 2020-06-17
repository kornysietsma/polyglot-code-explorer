import _ from "lodash";
import moment from "moment";

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

function setChurnMetric(state, metric) {
  const result = _.cloneDeep(state);
  switch (metric) {
    case "lines":
      _.set(result, ["config", "churn"], {
        metric,
        bad: 10,
        good: 0,
        ugly: 100,
        precision: 2
      });
      break;
    case "days":
      _.set(result, ["config", "churn"], {
        metric,
        bad: 0.1,
        good: 0,
        ugly: 0.5,
        precision: 4
      });
      break;
    case "commits":
      _.set(result, ["config", "churn"], {
        metric,
        bad: 0.1,
        good: 0,
        ugly: 1,
        precision: 4
      });
      break;
    default:
      throw Error(`Invalid metric: ${metric}`);
  }
  return result;
}

function initialiseGlobalState(initialData) {
  const {
    metadata: {
      stats: {
        maxDepth,
        maxLoc,
        earliestCommit,
        latestCommit,
        churn: { maxLines, maxCommits, maxDays }
      }
    }
  } = initialData;

  const twoYearsAgo = moment
    .unix(latestCommit)
    .subtract(2, "year")
    .unix();

  const earliest = twoYearsAgo < earliestCommit ? earliestCommit : twoYearsAgo;

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
      numberOfChangers: {
        // more of a colour thing than a scale really
        noChangersColour: "cyan",
        oneChangerColour: "brown",
        fewChangersMinColour: "green",
        fewChangersMaxColour: "blue",
        fewChangersMin: 2,
        fewChangersMax: 8, // this is a candidate to configure!
        manyChangersColour: "yellow",
        manyChangersMax: 30, // starting to feel like a crowd
        precision: 0,
        topChangersCount: 5 // show this many changers in NodeInspector
      },
      churn: {
        note: "overridden later!"
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
      depth: Math.min(8, maxDepth),
      dateRange: {
        earliest,
        latest: latestCommit
      }
    },
    stats: {
      maxDepth,
      maxLoc: Math.min(maxLoc, 2000),
      churn: { maxLines, maxCommits, maxDays } // duplicate so we can get it later!
    }
  };
  defaults = setIndentationMetric(defaults, "sum");
  defaults = setChurnMetric(defaults, "days");
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
    case "setChurnMetric": {
      const result = _.cloneDeep(state);
      _.set(result, ["config", "churn", "metric"], action.payload);
      return setChurnMetric(state, action.payload);
    }
    default:
      throw new Error(`Invalid dispatch type ${action.type}`);
  }
}

export { initialiseGlobalState, globalDispatchReducer };
