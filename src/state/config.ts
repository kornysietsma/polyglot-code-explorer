// The `Config` shape - everything the UI can change about how the tree is drawn - and the
// defaults `App` starts from. `initialiseGlobalState` builds a whole `State`, not just a
// `Config`, because the defaults for coupling, depth and the date slider all live here too.

import * as d3 from "d3";
import { addDays, fromUnixTime, getUnixTime, subYears } from "date-fns";

import {
  FileChangeMetric,
  infoMessage,
  State,
  TeamsAndAliases,
} from "../state";
import { postprocessState } from "../state/derived";
import { VizDataRef } from "../viz.types";

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
    nestedWidths: [number, number, number, number];
    defaultWidth: number;
  };
  teamsAndAliases: TeamsAndAliases;
  colours: {
    currentTheme: "dark" | "light"; // also sets css on the body!
    dark: {
      nestedStrokes: [string, string, string, string];
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
      nestedStrokes: [string, string, string, string];
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

export function initialiseGlobalState(initialDataRef: VizDataRef) {
  const {
    metadata: {
      stats: { maxDepth, earliest: earliestData, latest: latestData },
    },
    data: data,
  } = initialDataRef.current;

  const hasDates = earliestData !== undefined && latestData !== undefined;

  let earliest: number;
  let latest: number;
  // These four stay on date-fns' local-calendar arithmetic, unlike everything else in the app
  // (see `docs/dates-and-timezones.md`), and that is deliberate rather than an oversight. They
  // pick where the date slider *starts*, with two days of leeway either side so "everything" is
  // easy to select; an hour of local-vs-UTC drift in a bound that exists to be dragged changes
  // nothing anyone can see. Dates that are displayed or bucketed are UTC throughout.
  if (hasDates) {
    const twoYearsAgo = getUnixTime(subYears(fromUnixTime(latestData), 2));

    earliest = twoYearsAgo < earliestData ? earliestData : twoYearsAgo;
    latest = getUnixTime(addDays(fromUnixTime(latestData), 2)); // a bit of leeway for selecting all dates easily
  } else {
    earliest = getUnixTime(subYears(new Date(), 2));
    latest = getUnixTime(addDays(new Date(), 2));
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
        nestedWidths: [2, 2, 1, 1],
      },
      colours: {
        currentTheme: "dark", // also sets css on the body!
        dark: {
          nestedStrokes: ["#aaaaaa", "#777777", "#444444", "#222222"],
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
          nestedStrokes: ["#777777", "#aaaaaa", "#dddddd", "#eeeeee"],
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
