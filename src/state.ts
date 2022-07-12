import _ from "lodash";
import * as d3 from "d3";
import moment from "moment";
import VisualizationData from "./visualizationData";
import { nodeOwners } from "./nodeData";

function initialiseGlobalState(initialDataRef) {
  const {
    metadata: {
      stats: { maxDepth, earliestCommit, latestCommit, coupling },
    },
  } = initialDataRef.current;

  const twoYearsAgo = moment.unix(latestCommit).subtract(2, "year").unix();

  const earliest = twoYearsAgo < earliestCommit ? earliestCommit : twoYearsAgo;
  const latest = moment.unix(latestCommit).add(1, "day").unix(); // otherwise files committed today get confused
  const couplingAvailable = coupling !== undefined;

  const defaults = {
    config: {
      visualization: "language",
      subVis: undefined,
      layout: {
        timescaleHeight: 130, // including margins
      },
      remoteUrlTemplate: "https://{host}/{path}/{project}/blob/{ref}/{file}",
      codeInspector: {
        enabled: false,
        prefix: "http://localhost:8675/",
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
      owners: {
        // see also calculated.ownerData
        threshold: 90, // percentage of changes used for ownership
        linesNotCommits: false, // if true, threshold is on lines changed not commit counts
        topOwnerCount: 30, // only store this many changers. Needs to be as big or bigger than available colours
      },
      colours: {
        currentTheme: "dark", // also sets css on the body!
        dark: {
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
          ownerColours: {
            noOwnersColour: "#222222",
            oneOwnerColours: d3.schemeSet1,
            moreOwnerColours: d3.schemeSet2,
            otherColour: "#808080",
          },
        },
        light: {
          defaultStroke: "#f7f7f7",
          selectedStroke: "#fffa00",
          couplingStroke: "#ff6300", // need to change the arrow colour as well if you change this!
          goodColour: "blue",
          badColour: "red",
          uglyColour: "yellow",
          earlyColour: "blue",
          lateColour: "green",
          neutralColour: "#808080",
          nonexistentColour: "#f7f7f7",
          circlePackBackground: "#f7f7f7",
          ownerColours: {
            noOwnersColour: "#f7f7f7",
            oneOwnerColours: d3.schemeSet2,
            moreOwnerColours: d3.schemeSet1,
            otherColour: "#808080",
          },
        },
      },
      dateRange: {
        earliest,
        latest,
      },
      selectedNode: null,
    },
    couplingConfig: {
      couplingAvailable,
      shown: false,
      minBursts: 10,
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
    calculated: {
      // this is mostly for state calculated in the postProcessState stage, based on data
      ownerData: null,
    },
  };
  // could precalculate ownerData here - but it isn't needed until you select the 'owners' visualisation
  return defaults;
}

function themedColours(config) {
  return config.colours[config.colours.currentTheme];
}

function addOwnersFromNode(
  ownerData,
  node,
  earliest,
  latest,
  threshold,
  linesNotCommits
) {
  const owners = nodeOwners(node, earliest, latest, threshold, linesNotCommits);
  if (owners && owners.users !== "") {
    const { users, value, totalValue } = owners;

    // I want the scale to show:
    // - user count and name summary
    // - actual users as a hover
    // - global percentage - so % of all commits/lines
    // so per file, need to store total value, and value aggregated by this set of users.
    // (each file only has a single set of users, enough to get over the threshold)
    // So store this data - as:
    // { users: Set(user ids) - this is the key
    //   value: value contributed by these users
    //   totalValue: total value by all users
    //   file? No, not at this stage.
    //   fileCount is probably useful.
    // }
    if (!ownerData.has(users)) {
      ownerData.set(users, {
        value,
        totalValue,
        fileCount: 1,
      });
    } else {
      const oldData = ownerData.get(users);
      ownerData.set(users, {
        value: value + oldData.value,
        totalValue: totalValue + oldData.totalValue,
        fileCount: oldData.fileCount + 1,
      });
    }
  }
  if (node.children !== undefined) {
    // eslint-disable-next-line no-restricted-syntax
    for (const child of node.children) {
      addOwnersFromNode(
        ownerData,
        child,
        earliest,
        latest,
        threshold,
        linesNotCommits
      );
    }
  }
}

function aggregateOwnerData(data, newState) {
  // TODO - could this live in another module?
  const { threshold, linesNotCommits, topOwnerCount } = newState.config.owners;
  const { earliest, latest } = newState.config.dateRange;

  const ownerData = new Map();
  addOwnersFromNode(
    ownerData,
    data,
    earliest,
    latest,
    threshold,
    linesNotCommits
  );

  const topData = Array.from(ownerData)
    .sort(([key1, val1], [key2, val2]) => {
      return val2.fileCount - val1.fileCount;
    })
    .slice(0, topOwnerCount);

  return topData; // keep as an array of arrays not a map
}

// allows state changes that need to access data
function postprocessState(dataRef, oldState, newState) {
  if (
    newState.config.visualization === "owners" &&
    (oldState.config.visualization !== "owners" ||
      !_.isEqual(oldState.config.dateRange, newState.config.dateRange) ||
      !_.isEqual(oldState.config.owners, newState.config.owners))
  ) {
    console.log("recalculating owner data on state change");
    const result = _.cloneDeep(newState);
    result.calculated.ownerData = aggregateOwnerData(
      dataRef.current.files,
      newState
    );
    console.log("recalculation complete");
    return result;
  }
  return newState;
}

function updateStateFromAction(state, action) {
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
    case "setCouplingMinBursts": {
      return {
        ...state,
        couplingConfig: { ...couplingConfig, minBursts: action.payload },
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
      const [early, late] = action.payload;
      const result = _.cloneDeep(state);
      result.config.dateRange.earliest = early;
      result.config.dateRange.latest = late;
      result.couplingConfig.dateRange.earliest = early;
      result.couplingConfig.dateRange.latest = late;
      return result;
    }

    case "setTheme": {
      const result = _.cloneDeep(state);
      result.config.colours.currentTheme = action.payload;
      return result;
    }

    case "enableCodeServer": {
      const result = _.cloneDeep(state);
      result.config.codeInspector.enabled = action.payload;
      return result;
    }

    case "setCodeServerPrefix": {
      const result = _.cloneDeep(state);
      result.config.codeInspector.prefix = action.payload;
      return result;
    }

    case "setOwnersTheshold": {
      const result = _.cloneDeep(state);
      result.config.owners.threshold = action.payload;
      return result;
    }

    case "setOwnerLinesNotCommits": {
      const result = _.cloneDeep(state);
      result.config.owners.linesNotCommits = action.payload;
      return result;
    }

    case "setRemoteUrlTemplate": {
      const result = _.cloneDeep(state);
      result.config.remoteUrlTemplate = action.payload;
      return result;
    }

    default:
      throw new Error(`Invalid dispatch type ${action.type}`);
  }
}
// Note - this takes a binding of the data ref, so App.js can pass in the data and the reducer can update state based on data.
function globalDispatchReducer(dataRef) {
  return (state, action) => {
    const newState = updateStateFromAction(state, action);
    return postprocessState(dataRef, state, newState);
  };
}

export { themedColours, initialiseGlobalState, globalDispatchReducer };
