import * as d3 from "d3";
import _ from "lodash";
import moment from "moment";

import { calculateFileMaxima } from "./nodeData";
import { UserData } from "./polyglot_data.types";
import { calculateSvgPatterns } from "./svgPatterns";
import { isParentVisualization, Visualizations } from "./VisualizationData";
import { VizDataRef } from "./viz.types";

export type UserAliases = Map<number, number>;
export type UserAliasData = Map<number, UserData>;
export type Team = {
  users: Set<number>;
  colour: string;
  hidden: boolean;
};
export type Teams = Map<string, Team>;

export type FileChangeMetric = "lines" | "commits" | "files" | "days";

export type TeamsAndAliases = {
  teams: Teams;
  aliases: UserAliases;
  // alias keys are sequential numbers starting with the users length
  aliasData: UserAliasData;
  ignoredUsers: Set<number>;
};

export type Config = {
  visualization: string; // could be fixed set
  subVis?: string;
  layout: {
    timescaleHeight: number; // including margins
  };
  remoteUrlTemplate: string;
  // used by default in inspecion panels and when sorting
  fileChangeMetric: FileChangeMetric;
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
  teamVisualisation: {
    showNonTeamChanges: boolean; // do we show non-team changes when they exceed team changes?
    selectedTeam: string | undefined;
    showLevelAsLightness: boolean; // do we scale lightness by amount of change?
    lightnessCap: number; // scale for lightness in dark places
  };
  nesting: {
    nestedWidths: [number, number, number];
    defaultWidth: number;
  };
  teamsAndAliases: TeamsAndAliases;
  colours: {
    currentTheme: "dark" | "light"; // also sets css on the body!
    dark: {
      nestedStrokes: [string, string, string];
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
      teams: {
        noTeamColour: string; // when a file is changed by users not in teams
        selectedTeamColour: string;
        otherUsersColour: string;
      };
      circlePackBackground: string;
      ownerColours: {
        noOwnersColour: string;
        oneOwnerColours: string[];
        moreOwnerColours: string[];
        otherColour: string;
      };
    };
    light: {
      nestedStrokes: [string, string, string];
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
      teams: {
        noTeamColour: string; // when a file is changed by users not in teams
        selectedTeamColour: string;
        otherUsersColour: string;
      };
      circlePackBackground: string;
      ownerColours: {
        noOwnersColour: string;
        oneOwnerColours: string[];
        moreOwnerColours: string[];
        otherColour: string;
      };
    };
  };
  filters: {
    dateRange: {
      earliest: number;
      latest: number;
    };
  };
  // if blank, the root is selected (i.e. everything)
  selectedNode: string;
};

export type CouplingConfig = {
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

export type UserTeamData = Set<string>;
export type UserTeams = Map<number, UserTeamData>;

export type PatternId = number;
/** ColourKey is needed for map IDs - it's created from a string[] of colours, tab separated */
export type ColourKey = string;
export function colourKeyToColours(key: ColourKey): string[] {
  return key.split("\t");
}
export function coloursToColourKey(colours: string[]): ColourKey {
  return colours.join("\t");
}

export type FileMaxima = {
  days: number;
  commits: number;
  lines: number;
  files: number;
};

export type CalculatedState = {
  // if set to true, always recalculate (and set flag back to false!)
  // this is a bit of a hack, but sometimes easier than fiddling with
  // diffing state
  forceRecalculateAll: boolean;
  // team lookup for each user, calculated whenever teams or aliases change
  // aliased users will have no teams
  userTeams: UserTeams;
  // maximum level of change per file in selected range
  // used for single team vis, and maybe should be for churn?
  fileMaxima: FileMaxima;
  svgPatterns: {
    // SVG patterns are pre-calculated as we need the IDs before we draw
    // for each (calculated) ColourKey, stores the pattern ID (sequential unique numbers)
    svgPatternIds: Map<ColourKey, PatternId>;
    // for each file path in the tree, which pattern to use
    svgPatternLookup: Map<string, PatternId>;
  };
};

export type Message = {
  severity: "info" | "warn" | "error";
  message: string;
  timestamp: Date;
};

export function infoMessage(message: string): Message {
  return {
    severity: "info",
    message,
    timestamp: new Date(),
  };
}
export function warnMessage(message: string): Message {
  return {
    severity: "warn",
    message,
    timestamp: new Date(),
  };
}

export function errorMessage(message: string): Message {
  return {
    severity: "error",
    message,
    timestamp: new Date(),
  };
}

export type State = {
  config: Config;
  couplingConfig: CouplingConfig;
  expensiveConfig: ExpensiveConfig;
  calculated: CalculatedState;
  messages: Message[];
};

export function isAlias(users: UserData[], userId: number): boolean {
  return userId >= users.length;
}

export function possiblyAlias(aliases: UserAliases, userId: number): number {
  return aliases.get(userId) ?? userId;
}

export function getUserData(
  users: UserData[],
  state: State,
  userId: number
): UserData {
  const user = isAlias(users, userId)
    ? state.config.teamsAndAliases.aliasData.get(userId)
    : users[userId];
  if (user == undefined) {
    throw new Error(`Invalid user id #{userId}`);
  }
  return user;
}

export function sortTeamsByName(
  [nameA]: [string, Team],
  [nameB]: [string, Team]
): number {
  return nameA.localeCompare(nameB, "en", {
    ignorePunctuation: true,
    sensitivity: "accent",
  });
}

function initialiseGlobalState(initialDataRef: VizDataRef) {
  const {
    metadata: {
      stats: { maxDepth, earliest: earliestData, latest: latestData },
    },
    data: data,
  } = initialDataRef.current;

  const hasDates = earliestData !== undefined && latestData !== undefined;

  let earliest: number;
  let latest: number;
  if (hasDates) {
    const twoYearsAgo = moment.unix(latestData).subtract(2, "year").unix();

    earliest = twoYearsAgo < earliestData ? earliestData : twoYearsAgo;
    latest = moment.unix(latestData).add(2, "day").unix(); // a bit of leeway for selecting all dates easily
  } else {
    earliest = moment().subtract(2, "year").unix();
    latest = moment().add(2, "day").unix();
  }

  const defaultState: State = {
    config: {
      visualization: "language",
      subVis: undefined,
      layout: {
        timescaleHeight: 130, // including margins
      },
      remoteUrlTemplate: "https://{host}/{path}/{project}/blob/{ref}/{file}",
      fileChangeMetric: "lines",
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
        noChangersColour: "#00ffff",
        oneChangerColour: "#a52a2a",
        fewChangersMinColour: "#00ff00",
        fewChangersMaxColour: "#0000ff",
        fewChangersMin: 2,
        fewChangersMax: 8, // this is a candidate to configure!
        manyChangersColour: "#ffff00",
        manyChangersMax: 30, // starting to feel like a crowd
        precision: 0,
        topChangersCount: 10, // show this many changers in NodeInspector
      },
      teamVisualisation: {
        showNonTeamChanges: true,
        selectedTeam: undefined,
        showLevelAsLightness: true,
        lightnessCap: 1,
      },
      teamsAndAliases: {
        teams: new Map(),
        aliases: new Map(),
        aliasData: new Map(),
        ignoredUsers: new Set(),
      },
      nesting: {
        defaultWidth: 1,
        nestedWidths: [4, 3, 2],
      },
      colours: {
        currentTheme: "dark", // also sets css on the body!
        dark: {
          nestedStrokes: ["#aaaaaa", "#777777", "#444444"],
          defaultStroke: "#111111",
          selectedStroke: "#fffa00",
          couplingStroke: "#ff6300", // need to change the arrow colour as well if you change this!
          goodColour: "#0000ff",
          badColour: "#ff0000",
          uglyColour: "#ffff00",
          earlyColour: "#0000ff",
          lateColour: "#00ff00",
          neutralColour: "#808080",
          nonexistentColour: "#111111",
          errorColour: "#ff0000",
          teams: {
            noTeamColour: "#8080ff",
            selectedTeamColour: "#00ff00",
            otherUsersColour: "#ff0000",
          },
          circlePackBackground: "#111111",
          ownerColours: {
            noOwnersColour: "#222222",
            oneOwnerColours: [...d3.schemeSet1],
            moreOwnerColours: [...d3.schemeSet2],
            otherColour: "#808080",
          },
        },
        light: {
          nestedStrokes: ["#777777", "#aaaaaa", "#dddddd"],
          defaultStroke: "#f7f7f7",
          selectedStroke: "#fffa00",
          couplingStroke: "#ff6300", // need to change the arrow colour as well if you change this!
          goodColour: "#0000ff",
          badColour: "#ff0000",
          uglyColour: "#ffff00",
          earlyColour: "#0000ff",
          lateColour: "#00ff00",
          neutralColour: "#808080",
          nonexistentColour: "#f7f7f7",
          errorColour: "#ff0000",
          teams: {
            noTeamColour: "#8080ff",
            selectedTeamColour: "#00ffff",
            otherUsersColour: "#ff0000",
          },
          circlePackBackground: "#f7f7f7",
          ownerColours: {
            noOwnersColour: "#f7f7f7",
            oneOwnerColours: [...d3.schemeSet2],
            moreOwnerColours: [...d3.schemeSet1],
            otherColour: "#808080",
          },
        },
      },
      filters: {
        dateRange: {
          earliest,
          latest,
        },
      },
      selectedNode: "",
    },
    couplingConfig: {
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
        latest: latestData || latest,
      },
    },
    expensiveConfig: {
      depth: maxDepth,
    },
    calculated: {
      // this is mostly for state calculated in the postProcessState stage, based on data
      forceRecalculateAll: true,
      userTeams: new Map(),
      fileMaxima: {
        lines: 0,
        commits: 0,
        days: 0,
        files: 0,
      },
      svgPatterns: {
        svgPatternIds: new Map(),
        svgPatternLookup: new Map(),
      },
    },
    messages: [],
  };
  defaultState.messages.push(
    infoMessage(
      `Loaded data file: ${data.name} version ${data.version} ID ${data.id}`
    )
  );
  return postprocessState(initialDataRef, defaultState, defaultState);
}

function themedColours(config: Config) {
  return config.colours[config.colours.currentTheme];
}

export function themedErrorColour(config: Config) {
  return themedColours(config).errorColour;
}

export function buildUserTeams(teams: Teams): UserTeams {
  const result: UserTeams = new Map();
  for (const [name, team] of teams) {
    if (!team.hidden) {
      for (const user of team.users) {
        const userTeamData = result.get(user);
        if (!userTeamData) {
          result.set(user, new Set([name]));
        } else {
          userTeamData.add(name);
        }
      }
    }
  }
  return result;
}

// allows state changes that need to access data
function postprocessState(
  dataRef: VizDataRef,
  oldState: State,
  newState: State
) {
  console.time("postprocessing state");
  let resultingState = newState;
  let alreadyCloned = false; // if we modify state, need to clone it - but only once!
  const force = newState.calculated.forceRecalculateAll;
  const datesChanged = !_.isEqual(
    oldState.config.filters.dateRange,
    resultingState.config.filters.dateRange
  );
  if (
    force ||
    datesChanged ||
    !_.isEqual(
      resultingState.config.teamsAndAliases,
      oldState.config.teamsAndAliases
    )
  ) {
    console.time("postprocessing - building user teams");
    if (!alreadyCloned) {
      resultingState = _.cloneDeep(resultingState);
      alreadyCloned = true;
    }
    resultingState.calculated.userTeams = buildUserTeams(
      resultingState.config.teamsAndAliases.teams
    );
    console.timeEnd("postprocessing - building user teams");
  }
  if (force || datesChanged) {
    console.time("postprocessing - file maxima");
    resultingState.calculated.fileMaxima = calculateFileMaxima(
      resultingState,
      dataRef.current.data.tree
    );
    console.timeEnd("postprocessing - file maxima");
  }
  if (force || newState.config.visualization == "teamPattern") {
    console.time("checking for svg state change");
    if (
      force ||
      oldState.config.visualization != newState.config.visualization ||
      !_.isEqual(
        oldState.config.teamVisualisation,
        newState.config.teamVisualisation
      ) ||
      !_.isEqual(
        oldState.config.teamsAndAliases,
        newState.config.teamsAndAliases
      ) ||
      datesChanged ||
      oldState.config.teamVisualisation.showNonTeamChanges !=
        newState.config.teamVisualisation.showNonTeamChanges ||
      themedColours(oldState.config).teams !=
        themedColours(newState.config).teams
    ) {
      console.timeEnd("checking for svg state change");
      console.time("postprocessing - svg patterns");
      if (!alreadyCloned) {
        resultingState = _.cloneDeep(resultingState);
        alreadyCloned = true;
      }
      resultingState.calculated.svgPatterns = calculateSvgPatterns(
        resultingState,
        dataRef.current.data
      );
      console.timeEnd("postprocessing - svg patterns");
    } else {
      console.timeEnd("checking for svg state change");
    }
  }
  if (force) {
    if (!alreadyCloned) {
      resultingState = _.cloneDeep(resultingState);
      alreadyCloned = true;
    }
    resultingState.calculated.forceRecalculateAll = false;
  }
  console.timeEnd("postprocessing state");
  return resultingState;
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
interface SetRemoteUrlTemplate {
  type: "setRemoteUrlTemplate";
  payload: string;
}
interface AddMessage {
  type: "addMessage";
  payload: Message;
}
interface AddMessages {
  type: "addMessages";
  payload: Message[];
}

interface ClearMessages {
  type: "clearMessages";
}
interface SetUserTeamAliasData {
  type: "setUserTeamAliasData";
  payload: {
    teams: Teams;
    aliases: UserAliases;
    ignoredUsers: Set<number>;
    aliasData: UserAliasData;
    noTeamColour: string;
  };
}
interface SetFileChangeMetric {
  type: "setFileChangeMetric";
  payload: FileChangeMetric;
}

interface SetShowNonTeamChanges {
  type: "setShowNonTeamChanges";
  payload: boolean;
}

interface SelectTeam {
  type: "selectTeam";
  payload: string;
}

interface SetShowLevelAsLightness {
  type: "setShowLevelAsLightness";
  payload: boolean;
}

interface SetColour {
  type: "setColour";
  payload: { name: string; value: string };
}

interface SetLines {
  type: "setLines";
  payload: {
    nestedWidths: [number, number, number];
    defaultWidth: number;
    nestedStrokes: [string, string, string];
    defaultStroke: string;
  };
}

interface SetLightnessCap {
  type: "setLightnessCap";
  payload: number;
}

interface SetAllState {
  type: "setAllState";
  payload: State;
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
  | SetRemoteUrlTemplate
  | AddMessage
  | AddMessages
  | ClearMessages
  | SetUserTeamAliasData
  | SetFileChangeMetric
  | SetShowNonTeamChanges
  | SelectTeam
  | SetShowLevelAsLightness
  | SetLightnessCap
  | SetColour
  | SetLines
  | SetAllState;

function updateStateFromAction(state: State, action: Action): State {
  const { expensiveConfig, couplingConfig, config } = state;
  switch (action.type) {
    case "setVisualization": {
      const visualization = action.payload;
      const visData = Visualizations[visualization];
      if (visData == undefined) {
        throw new Error("Logic error, invalid visualization");
      }
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
      result.config.filters.dateRange.earliest = early;
      result.config.filters.dateRange.latest = late;
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

    case "setRemoteUrlTemplate": {
      const result = _.cloneDeep(state);
      result.config.remoteUrlTemplate = action.payload;
      return result;
    }

    case "addMessage": {
      return { ...state, messages: [...state.messages, action.payload] };
    }

    case "addMessages": {
      return { ...state, messages: [...state.messages, ...action.payload] };
    }

    case "clearMessages": {
      return { ...state, messages: [] };
    }

    case "setUserTeamAliasData": {
      const result = _.cloneDeep(state);
      result.config.teamsAndAliases.teams = action.payload.teams;
      result.config.teamsAndAliases.aliases = action.payload.aliases;
      result.config.teamsAndAliases.ignoredUsers = action.payload.ignoredUsers;
      result.config.teamsAndAliases.aliasData = action.payload.aliasData;
      result.config.colours[
        result.config.colours.currentTheme
      ].teams.noTeamColour = action.payload.noTeamColour;

      return result;
    }

    case "setFileChangeMetric":
      return {
        ...state,
        config: { ...config, fileChangeMetric: action.payload },
      };

    case "setShowNonTeamChanges": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.showNonTeamChanges = action.payload;
      return result;
    }

    case "selectTeam": {
      const newTeam = action.payload == "" ? undefined : action.payload;
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.selectedTeam = newTeam;
      return result;
    }
    case "setShowLevelAsLightness": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.showLevelAsLightness = action.payload;
      return result;
    }
    case "setLightnessCap": {
      const result = _.cloneDeep(state);
      result.config.teamVisualisation.lightnessCap = action.payload;
      return result;
    }
    case "setAllState": {
      return action.payload;
    }

    case "setColour": {
      const result = _.cloneDeep(state);
      _.set(
        themedColours(result.config),
        action.payload.name,
        action.payload.value
      );
      return result;
    }

    case "setLines": {
      const result = _.cloneDeep(state);
      result.config.nesting.nestedWidths = [...action.payload.nestedWidths];
      result.config.nesting.defaultWidth = action.payload.defaultWidth;
      themedColours(result.config).defaultStroke = action.payload.defaultStroke;
      themedColours(result.config).nestedStrokes = [
        ...action.payload.nestedStrokes,
      ];

      return result;
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
