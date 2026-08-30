import { UserData } from "./polyglot_data.types";
import { ColourKey, PatternId } from "./state/colours";
import { Config } from "./state/config";
import { VizMetadata } from "./viz.types";

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

/**
 * Alias ids are allocated from `users.length` upward (see `TeamsAndAliases.aliasData`), so an id
 * past the end of the real user list is an alias. That threshold is a deliberate remaining
 * assumption: it only holds while the data file's user list is dense, which
 * `preprocess.indexUsersById` checks on load.
 */
export function isAlias(users: UserData[], userId: number): boolean {
  return userId >= users.length;
}

export function possiblyAlias(aliases: UserAliases, userId: number): number {
  return aliases.get(userId) ?? userId;
}

export function getUserData(
  metadata: VizMetadata,
  state: State,
  userId: number
): UserData {
  const user = isAlias(metadata.users, userId)
    ? state.config.teamsAndAliases.aliasData.get(userId)
    : metadata.usersById.get(userId);
  if (user == undefined) {
    throw new Error(`Invalid user id ${userId}`);
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
