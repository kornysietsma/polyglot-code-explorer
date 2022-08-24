import * as d3 from "d3";
import _ from "lodash";
import moment from "moment";

import { nodeOwners } from "./nodeData";
import { isDirectory, isFile, TreeNode } from "./polyglot_data.types";
import { isParentVisualization, Visualizations } from "./VisualizationData";
import { VizDataRef } from "./viz.types";

export type Config = {
  visualization: string; // could be fixed set
  subVis?: string;
  layout: {
    timescaleHeight: number; // including margins
  };
  remoteUrlTemplate: string;
  codeInspector: {
    enabled: boolean;
    prefix: string;
  };
  loc: {
    bad: number;
    good: number;
    ugly: number;
    precision: number; // number of float digits to show
  };
  indentation: {
    // replace indentation when we've refactored everything
    sum: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
    p99: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
    stddev: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
  };
  age: {
    bad: number;
    good: number;
    ugly: number;
    precision: number;
  };
  churn: {
    lines: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
    days: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
    commits: {
      bad: number;
      good: number;
      ugly: number;
      precision: number;
    };
  };
  numberOfChangers: {
    // more of a colour thing than a scale really
    noChangersColour: string;
    oneChangerColour: string;
    fewChangersMinColour: string;
    fewChangersMaxColour: string;
    fewChangersMin: number;
    fewChangersMax: number; // this is a candidate to configure!
    manyChangersColour: string;
    manyChangersMax: number; // starting to feel like a crowd
    precision: number;
    topChangersCount: number; // show this many changers in NodeInspector
  };
  owners: {
    // see also calculated.ownerData
    threshold: number; // percentage of changes used for ownership
    linesNotCommits: boolean; // if true; threshold is on lines changed not commit counts
    topOwnerCount: number; // only store this many changers. Needs to be as big or bigger than available colours
  };
  colours: {
    currentTheme: "dark" | "light"; // also sets css on the body!
    dark: {
      defaultStroke: string;
      selectedStroke: string;
      couplingStroke: string; // need to change the arrow colour as well if you change this!
      goodColour: string;
      badColour: string;
      uglyColour: string;
      earlyColour: string;
      lateColour: string;
      neutralColour: string;
      nonexistentColour: string;
      errorColour: string; // used for logic errors - should never appear
      circlePackBackground: string;
      ownerColours: {
        noOwnersColour: string;
        oneOwnerColours: string[];
        moreOwnerColours: string[];
        otherColour: string;
      };
    };
    light: {
      defaultStroke: string;
      selectedStroke: string;
      couplingStroke: string; // need to change the arrow colour as well if you change this!
      goodColour: string;
      badColour: string;
      uglyColour: string;
      earlyColour: string;
      lateColour: string;
      neutralColour: string;
      nonexistentColour: string;
      errorColour: string; // used for logic errors - should never appear
      circlePackBackground: string;
      ownerColours: {
        noOwnersColour: string;
        oneOwnerColours: string[];
        moreOwnerColours: string[];
        otherColour: string;
      };
    };
  };
  dateRange: {
    earliest: number;
    latest: number;
  };
  // TODO: selectedNode needs to be made serializable - probably as a path - used to be a node
  selectedNode?: string;
};

export type CouplingConfig = {
  couplingAvailable: boolean;
  shown: boolean;
  minBursts: number;
  minRatio: number;
  // maxCommonRoots - -1 means show all coupling
  // 0 means only show files who have no roots in common - so /foo/baz.txt and /bar/baz.js
  // 1 means only show files who have 0 or 1 roots in common - so /foo/bar/baz and /foo/fi/fum can match
  maxCommonRoots: number;
  dateRange: {
    // TODO: use buckets instead!
    earliest: number;
    latest: number;
  };
};

export type ExpensiveConfig = {
  depth: number;
};

export type CalculatedState = {
  // this is mostly for state calculated in the postProcessState stage; based on data
  ownerData: OwnerData;
};

export type Message = {
  severity: "info" | "warn" | "error";
  message: string;
  timestamp: Date;
};

export type State = {
  config: Config;
  couplingConfig: CouplingConfig;
  expensiveConfig: ExpensiveConfig;
  calculated: CalculatedState;
  messages: Message[];
};

function initialiseGlobalState(initialDataRef: VizDataRef) {
  const {
    metadata: {
      stats: { maxDepth, earliestCommit, latestCommit, coupling },
    },
    files,
  } = initialDataRef.current;

  const hasDates = earliestCommit !== undefined && latestCommit !== undefined;

  let earliest: number;
  let latest: number;
  if (hasDates) {
    const twoYearsAgo = moment.unix(latestCommit).subtract(2, "year").unix();

    earliest = twoYearsAgo < earliestCommit ? earliestCommit : twoYearsAgo;
    latest = moment.unix(latestCommit).add(1, "day").unix(); // otherwise files committed today get confused
  } else {
    earliest = moment().subtract(2, "year").unix();
    latest = moment().add(1, "day").unix();
  }
  const couplingAvailable = coupling !== undefined;

  const defaults: State = {
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
          errorColour: "#ff0000",
          circlePackBackground: "#111111",
          ownerColours: {
            noOwnersColour: "#222222",
            oneOwnerColours: [...d3.schemeSet1],
            moreOwnerColours: [...d3.schemeSet2],
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
          errorColour: "#ff0000",
          circlePackBackground: "#f7f7f7",
          ownerColours: {
            noOwnersColour: "#f7f7f7",
            oneOwnerColours: [...d3.schemeSet2],
            moreOwnerColours: [...d3.schemeSet1],
            otherColour: "#808080",
          },
        },
      },
      dateRange: {
        earliest,
        latest,
      },
      selectedNode: undefined,
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
        latest: latestCommit || latest,
      },
    },
    expensiveConfig: {
      depth: maxDepth,
    },
    calculated: {
      // this is mostly for state calculated in the postProcessState stage, based on data
      ownerData: [],
    },
    messages: [],
  };
  defaults.messages.push({
    timestamp: new Date(),
    severity: "info",
    message: `Loaded data file: ${files.id} version ${files.version}`,
  });
  // could precalculate ownerData here - but it isn't needed until you select the 'owners' visualisation
  return defaults;
}

function themedColours(config: Config) {
  return config.colours[config.colours.currentTheme];
}

export function themedErrorColour(config: Config) {
  return themedColours(config).errorColour;
}

type OwnerMap = Map<
  string,
  { value: number; totalValue: number; fileCount: number }
>;

export type OwnerData = [
  owners: string,
  data: { value: number; totalValue: number; fileCount: number }
][];

function addOwnersFromNode(
  ownerMap: OwnerMap,
  node: TreeNode,
  earliest: number,
  latest: number,
  threshold: number,
  linesNotCommits: boolean
) {
  if (isFile(node)) {
    const owners = nodeOwners(
      node,
      earliest,
      latest,
      threshold,
      linesNotCommits
    );
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
      const oldData = ownerMap.get(users);
      if (!oldData) {
        ownerMap.set(users, {
          value,
          totalValue,
          fileCount: 1,
        });
      } else {
        ownerMap.set(users, {
          value: value + oldData.value,
          totalValue: totalValue + oldData.totalValue,
          fileCount: oldData.fileCount + 1,
        });
      }
    }
  }
  if (isDirectory(node)) {
    // eslint-disable-next-line no-restricted-syntax
    for (const child of node.children) {
      addOwnersFromNode(
        ownerMap,
        child,
        earliest,
        latest,
        threshold,
        linesNotCommits
      );
    }
  }
}

function aggregateOwnerData(data: TreeNode, newState: State): OwnerData {
  // TODO - could this live in another module?
  const { threshold, linesNotCommits, topOwnerCount } = newState.config.owners;
  const { earliest, latest } = newState.config.dateRange;

  const ownerMap: OwnerMap = new Map();
  addOwnersFromNode(
    ownerMap,
    data,
    earliest,
    latest,
    threshold,
    linesNotCommits
  );

  const topData = Array.from(ownerMap)
    .sort(([, val1], [, val2]) => {
      return val2.fileCount - val1.fileCount;
    })
    .slice(0, topOwnerCount);

  return topData; // keep as an array of arrays not a map
}

// allows state changes that need to access data
function postprocessState(
  dataRef: VizDataRef,
  oldState: State,
  newState: State
) {
  if (
    newState.config.visualization === "owners" &&
    (oldState.config.visualization !== "owners" ||
      !_.isEqual(oldState.config.dateRange, newState.config.dateRange) ||
      !_.isEqual(oldState.config.owners, newState.config.owners))
  ) {
    console.log("recalculating owner data on state change");
    const result = _.cloneDeep(newState);
    result.calculated.ownerData = aggregateOwnerData(
      dataRef.current.files.tree,
      newState
    );
    console.log("recalculation complete");
    return result;
  }
  return newState;
}

type VisualizationKey = Extract<keyof typeof Visualizations, string>;
interface SetVisualization {
  type: "setVisualization";
  payload: VisualizationKey;
}

interface SetSubVisualization {
  type: "setSubVisualization";
  payload: string;
}

interface SetDepth {
  type: "setDepth";
  payload: number;
}

interface SetShowCoupling {
  type: "setShowCoupling";
  payload: boolean;
}

interface SetMinCouplingRatio {
  type: "setMinCouplingRatio";
  payload: number;
}

interface SetCouplingMinBursts {
  type: "setCouplingMinBursts";
  payload: number;
}

interface SetCouplingMaxCommonRoots {
  type: "setCouplingMaxCommonRoots";
  payload: number;
}

interface SelectNode {
  type: "selectNode";
  payload: string;
}

interface SetDateRange {
  type: "setDateRange";
  payload: [number, number];
}
interface SetTheme {
  type: "setTheme";
  payload: "dark" | "light";
}
interface EnableCodeServer {
  type: "enableCodeServer";
  payload: boolean;
}
interface SetCodeServerPrefix {
  type: "setCodeServerPrefix";
  payload: string;
}
interface SetOwnersThreshold {
  type: "setOwnersTheshold";
  payload: number;
}
interface SetOwnerLinesNotCommits {
  type: "setOwnerLinesNotCommits";
  payload: boolean;
}
interface SetRemoteUrlTemplate {
  type: "setRemoteUrlTemplate";
  payload: string;
}
interface AddMessage {
  type: "addMessage";
  payload: { severity: "info" | "warn" | "error"; message: string };
}
interface ClearMessages {
  type: "clearMessages";
}

export type Action =
  | SetVisualization
  | SetSubVisualization
  | SetDepth
  | SetShowCoupling
  | SetMinCouplingRatio
  | SetCouplingMinBursts
  | SetCouplingMaxCommonRoots
  | SelectNode
  | SetDateRange
  | SetTheme
  | EnableCodeServer
  | SetCodeServerPrefix
  | SetOwnersThreshold
  | SetOwnerLinesNotCommits
  | SetRemoteUrlTemplate
  | AddMessage
  | ClearMessages;

function updateStateFromAction(state: State, action: Action): State {
  const { expensiveConfig, couplingConfig, config } = state;
  switch (action.type) {
    case "setVisualization": {
      const visualization = action.payload;
      const visData = Visualizations[visualization];
      if (isParentVisualization(visData)) {
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

    case "addMessage": {
      const message: Message = {
        ...action.payload,
        timestamp: new Date(),
      };
      return { ...state, messages: [...state.messages, message] };
    }

    case "clearMessages": {
      return { ...state, messages: [] };
    }

    default: {
      const impossible: never = action; // this will cause an error if an Action type isn't handled above
      return impossible;
    }
  }
}

// Note - this takes a binding of the data ref, so App.js can pass in the data and the reducer can update state based on data.
// TODO: use immer? Needs a change from my base sample as `produce()` doesn't quite fit with `postprocessState`
function globalDispatchReducer(dataRef: VizDataRef) {
  return (state: State, action: Action) => {
    const newState = updateStateFromAction(state, action);
    return postprocessState(dataRef, state, newState);
  };
}

export { globalDispatchReducer, initialiseGlobalState, themedColours };
