import _ from "lodash";
import moment from "moment";
import VisualizationData from "./visualizationData";

function initialiseGlobalState(initialDataRef) {
  const {
    metadata: {
      stats: { maxDepth, earliestCommit, latestCommit, coupling },
    },
  } = initialDataRef.current;

  const twoYearsAgo = moment.unix(latestCommit).subtract(2, "year").unix();

  const earliest = twoYearsAgo < earliestCommit ? earliestCommit : twoYearsAgo;
  const couplingAvailable = coupling !== undefined;

  const defaults = {
    config: {
      visualization: "language",
      subVis: undefined,
      layout: {
        timescaleHeight: 130, // including margins
      },
      loc: {
        bad: 1000,
        good: 0,
        ugly: 10000,
        precision: 0, // number of float digits to show
      },
      indentation: {
        // replace indentation when we've refactored everything
        sum: {
          bad: 10000,
          good: 0,
          ugly: 100000,
          precision: 0,
        },
        p99: {
          bad: 30,
          good: 0,
          ugly: 80,
          precision: 0,
        },
        stddev: {
          bad: 10,
          good: 3,
          ugly: 20,
          precision: 2,
        },
      },
      age: {
        bad: 365,
        good: 0,
        ugly: 365 * 4,
        maxAge: 365 * 2,
        precision: 0,
      },
      creation: {
        // these are not needed - using selection!
        low: 0,
        high: Math.floor((latestCommit - earliestCommit) / (24 * 60 * 60)),
        precision: 0,
      },
      churn: {
        lines: {
          bad: 10,
          good: 0,
          ugly: 100,
          precision: 2,
        },
        days: {
          bad: 0.1,
          good: 0,
          ugly: 0.5,
          precision: 4,
        },
        commits: {
          bad: 0.1,
          good: 0,
          ugly: 1,
          precision: 4,
        },
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
        topChangersCount: 5, // show this many changers in NodeInspector
      },
      colours: {
        defaultStroke: "#111111",
        selectedStroke: "#fffa00",
        couplingStroke: "#ff6300", // need to change the arrow colour as well if you change this!
        goodColour: "blue",
        badColour: "red",
        uglyColour: "yellow",
        earlyColour: "blue",
        lateColour: "green",
        neutralColour: "#808080",
        nonexistentColour: "#111111",
        circlePackBackground: "#111111",
      },
      dateRange: {
        earliest,
        latest: latestCommit,
      },
      selectedNode: null,
    },
    couplingConfig: {
      couplingAvailable,
      shown: false,
      minDays: 10,
      minRatio: 0.9,
      // maxCommonRoots - -1 means show all coupling
      // 0 means only show files who have no roots in common - so /foo/baz.txt and /bar/baz.js
      // 1 means only show files who have 0 or 1 roots in common - so /foo/bar/baz and /foo/fi/fum can match
      maxCommonRoots: -1,
      dateRange: {
        // TODO: use buckets instead!
        earliest,
        latest: latestCommit,
      },
    },
    expensiveConfig: {
      depth: maxDepth,
    },
  };
  return defaults;
}

function globalDispatchReducer(state, action) {
  const { expensiveConfig, couplingConfig, config } = state;
  switch (action.type) {
    case "setVisualization": {
      const visualization = action.payload;
      const visData = VisualizationData[visualization];
      if (visData.subVis) {
        const subVis = visData.defaultChild;
        return {
          ...state,
          config: {
            ...config,
            visualization,
            subVis,
          },
        };
      }
      return { ...state, config: { ...config, visualization } };
    }
    case "setSubVisualization":
      return { ...state, config: { ...config, subVis: action.payload } };
    case "setDepth":
      return {
        ...state,
        expensiveConfig: { ...expensiveConfig, depth: action.payload },
      };
    case "setShowCoupling": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, shown: action.payload },
      };
    }
    case "setMinCouplingRatio": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, minRatio: action.payload },
      };
    }
    case "setCouplingMinDays": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, minDays: action.payload },
      };
    }
    case "setCouplingMaxCommonRoots": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, maxCommonRoots: action.payload },
      };
    }
    case "selectNode":
      return {
        ...state,
        config: { ...config, selectedNode: action.payload },
      };

    case "setDateRange": {
      console.log("Setting dates", action.payload);
      const [early, late] = action.payload;
      const result = _.cloneDeep(state);
      result.config.dateRange.earliest = early;
      result.config.dateRange.latest = late;
      result.couplingConfig.dateRange.earliest = early;
      result.couplingConfig.dateRange.latest = late;
      return result;
    }
    default:
      throw new Error(`Invalid dispatch type ${action.type}`);
  }
}

export { initialiseGlobalState, globalDispatchReducer };
