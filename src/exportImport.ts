/* for exporting and importing aliases and teams to JSON
  Tries to avoid saving user IDs so the data can be imported
  to a different project with similar users.
  Not very reliable but sometimes worth it.
*/

import semver from "semver";

import {
  PolyglotData,
  SUPPORTED_FILE_VERSION,
  UserData,
} from "./polyglot_data.types";
import {
  Config,
  CouplingConfig,
  errorMessage,
  ExpensiveConfig,
  getUserData,
  isAlias,
  Message,
  State,
  Teams,
  TeamsAndAliases,
  UserAliasData,
  UserAliases,
} from "./state";
import { VizMetadata } from "./viz.types";

/** the version of the format file - changes whenever state format changes */
export const FORMAT_FILE_VERSION = "1.4.2";

/** User data can be saved on it's own, in which case it has it's own format version */
export const FORMAT_FILE_USER_VERSION = "1.3.4";

export type ExportUser = {
  name: string;
  email: string;
};

export type ExportTeamMember = ExportUser & { isAlias: boolean };

/** for reverse indexes */
export function userAsKey(user: UserData | ExportUser) {
  return `${user.name}\t${user.email}\tf`;
}
export function aliasAsKey(user: UserData | ExportUser) {
  return `${user.name}\t${user.email}\tt`;
}

export type ExportTeam = {
  name: string;
  users: ExportTeamMember[];
  colour: string;
  hidden: boolean;
};

export type ExportTeamsAndAliases = {
  aliasData: ExportUser[];
  aliases: [user: ExportUser, aliasedTo: ExportUser][];
  teams: ExportTeam[];
  ignoredUsers: ExportUser[];
};

export type StandaloneExportTeamsAndAliases = {
  formatVersion: string;
  teamsAndAliases: ExportTeamsAndAliases;
};

type ExportableConfig = Omit<Config, "teamsAndAliases">;

export type ExportableState = {
  dataVersion: string;
  formatVersion: string;
  name: string;
  id: string;
  config: ExportableConfig;
  couplingConfig: CouplingConfig;
  expensiveConfig: ExpensiveConfig;
  teamsAndAliases: ExportTeamsAndAliases;
};

function toExportUser(
  users: UserData[],
  state: State,
  userId: number
): ExportUser {
  const user = getUserData(users, state, userId);
  return { name: user.name, email: user.email };
}
function toExportTeamMember(
  users: UserData[],
  state: State,
  userId: number
): ExportTeamMember {
  const user = getUserData(users, state, userId);
  return {
    name: user.name,
    email: user.email,
    isAlias: isAlias(users, userId),
  };
}

function exportableTeamsAndAliases(
  state: State,
  users: UserData[]
): ExportTeamsAndAliases {
  const { teamsAndAliases } = state.config;

  const toExport = (userId: number) => {
    return toExportUser(users, state, userId);
  };

  const aliasData: ExportUser[] = [...teamsAndAliases.aliasData]
    .sort(([userIdA], [userIdB]) => userIdB - userIdA)
    .map(([, user]) => {
      return { name: user.name, email: user.email };
    });
  const exportableAliases: [user: ExportUser, aliasedTo: ExportUser][] = [
    ...teamsAndAliases.aliases,
  ].map(([fromUser, toUser]) => [toExport(fromUser), toExport(toUser)]);
  const teams: ExportTeam[] = [...teamsAndAliases.teams].map(
    ([teamName, team]) => {
      const teamMembers: ExportTeamMember[] = [...team.users].map((u) =>
        toExportTeamMember(users, state, u)
      );
      return {
        name: teamName,
        users: teamMembers,
        colour: team.colour,
        hidden: team.hidden,
      };
    }
  );
  const ignoredUsers: ExportUser[] = [...teamsAndAliases.ignoredUsers]
    .sort()
    .map((userId) => toExport(userId));

  return {
    aliasData,
    aliases: exportableAliases,
    teams,
    ignoredUsers,
  };
}

export function stateToExportable(
  files: PolyglotData,
  state: State,
  metadata: VizMetadata
): ExportableState {
  // explicitly save these parts of state - other parts might not be wanted
  const { teamsAndAliases: _unused, ...trimmedConfig } = state.config;
  const fixedConfig: ExportableConfig = {
    ...trimmedConfig,
  };

  return {
    dataVersion: files.version,
    formatVersion: FORMAT_FILE_VERSION,
    name: files.name,
    id: files.id,
    config: fixedConfig,
    expensiveConfig: state.expensiveConfig,
    couplingConfig: state.couplingConfig,
    teamsAndAliases: exportableTeamsAndAliases(state, metadata.users),
  };
}

export function stateFromExportable(
  metadata: VizMetadata,
  exportableState: ExportableState,
  tolerant: boolean
): { state?: State; messages: Message[] } {
  const messages: Message[] = [];
  try {
    const { users } = metadata;
    let failed = false;

    const { aliasData, aliases, teams, ignoredUsers } =
      exportableState.teamsAndAliases;

    if (exportableState.formatVersion != FORMAT_FILE_VERSION) {
      messages.push(
        errorMessage(
          `Invalid format version ${exportableState.formatVersion} - expected ${FORMAT_FILE_VERSION}`
        )
      );
      if (!tolerant) failed = true;
    }
    if (
      !semver.satisfies(exportableState.dataVersion, SUPPORTED_FILE_VERSION)
    ) {
      messages.push(
        errorMessage(
          `Invalid state file data version ${exportableState.dataVersion} - this release of Explorer supports  ${SUPPORTED_FILE_VERSION}`
        )
      );
      if (!tolerant) failed = true;
    }

    const {
      newTeamsAndAliases,
      failed: newFailed,
      messages: newMessages,
    } = teamsAndAliasesFromImport(
      users,
      aliases,
      aliasData,
      teams,
      ignoredUsers,
      tolerant
    );
    if (newFailed) {
      failed = true;
    }
    if (newMessages.length > 0) {
      messages.push(...newMessages);
    }
    if (newTeamsAndAliases == undefined) {
      // teamsAndAliasesFromImport must have failed fatally
      return { state: undefined, messages };
    }
    const newConfig: Config = {
      ...exportableState.config,
      ...{ teamsAndAliases: newTeamsAndAliases },
    };
    const newState: State = {
      config: newConfig,
      couplingConfig: exportableState.couplingConfig,
      expensiveConfig: exportableState.expensiveConfig,
      calculated: {
        forceRecalculateAll: true,
        // calculated in dispatcher
        userTeams: new Map(),
        svgPatterns: { svgPatternIds: new Map(), svgPatternLookup: new Map() },
        fileMaxima: { lines: 0, days: 0, commits: 0, files: 0 },
      },
      messages,
    };
    if (newState.config.nesting == undefined) {
      // hacky addition so nesting colours doesn't break when loading old state file
      messages.push(errorMessage("fixing missing state"));
      newState.config.nesting = {
        defaultWidth: 1,
        nestedWidths: [4, 3, 2],
      };
      newState.config.colours.dark.nestedStrokes = [
        "#aaaaaa",
        "#777777",
        "#444444",
      ];
      newState.config.colours.light.nestedStrokes = [
        "#777777",
        "#aaaaaa",
        "#dddddd",
      ];
    }
    return { state: failed ? undefined : newState, messages };
  } catch (e) {
    messages.push(errorMessage(`${e}`));
    return { state: undefined, messages };
  }
}

export function teamsAndAliasesFromImport(
  users: UserData[],
  importedAliases: [user: ExportUser, aliasedTo: ExportUser][],
  importedAliasData: ExportUser[],
  importedTeams: ExportTeam[],
  importedIgnoredUsers: ExportUser[],
  tolerant: boolean
): {
  newTeamsAndAliases?: TeamsAndAliases;
  failed: boolean;
  messages: Message[];
} {
  let failed = false;
  const messages: Message[] = [];
  try {
    const firstAliasId = users.length;
    const newAliasData: UserAliasData = new Map(
      importedAliasData.map((alias, index) => {
        const newId: number = index + firstAliasId;
        return [newId, { id: newId, name: alias.name, email: alias.email }];
      })
    );
    const reverseLookup: Map<string, number> = new Map();
    const aliasReverseLookup: Map<string, number> = new Map();
    for (const user of users) {
      reverseLookup.set(userAsKey(user), user.id);
    }
    for (const alias of newAliasData.values()) {
      aliasReverseLookup.set(userAsKey(alias), alias.id);
    }
    const lookupUser = (exportUser: ExportUser, isAlias: boolean) => {
      const userKey = userAsKey(exportUser);
      const userMatch = isAlias
        ? aliasReverseLookup.get(userKey)
        : reverseLookup.get(userKey);

      if (userMatch == undefined) {
        messages.push(
          errorMessage(
            `Unknown ${isAlias ? "alias" : "user"} "${exportUser.name} <${
              exportUser.email
            }>"`
          )
        );
        if (!tolerant) failed = true;
        return undefined;
      }
      return userMatch;
    };

    const newTeams: Teams = new Map(
      importedTeams.map((team) => {
        return [
          team.name,
          {
            colour: team.colour,
            users: new Set<number>(
              team.users
                .map((u) => lookupUser(u, u.isAlias))
                .filter((u) => u != undefined) as number[]
            ),
            hidden: team.hidden,
          },
        ];
      })
    );
    const newAliases: UserAliases = new Map(
      importedAliases
        .map(([user, aliasedTo]) => {
          return [lookupUser(user, false), lookupUser(aliasedTo, true)];
        })
        .filter(([a, b]) => a != undefined && b != undefined) as [
        number,
        number
      ][]
    );
    const newIgnoredUsers: Set<number> = new Set(
      importedIgnoredUsers
        .map((user) => lookupUser(user, false))
        .filter((u) => u != undefined) as number[]
    );
    const newTeamsAndAliases = {
      teams: newTeams,
      aliases: newAliases,
      aliasData: newAliasData,
      ignoredUsers: newIgnoredUsers,
    };
    return { newTeamsAndAliases, failed, messages };
  } catch (e) {
    messages.push(errorMessage(`${e}`));
    return { newTeamsAndAliases: undefined, failed: true, messages };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonReplacer(key: string, value: any): any {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: [...value],
    };
  } else if (value instanceof Set) {
    return {
      dataType: "Set",
      value: [...value],
    };
  } else {
    return value;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonReviver(key: string, value: any): any {
  if (typeof value === "object" && value !== null) {
    if (value.dataType !== undefined) {
      if (value.dataType === "Map") {
        return new Map(value.value);
      }
      if (value.dataType === "Set") {
        return new Set(value.value);
      }
    }
  }
  return value;
}

export function exportableStateToJson(state: ExportableState): string {
  return JSON.stringify(state, jsonReplacer, 2);
}

export function exportableTeamsAndAliasesToJson(
  state: StandaloneExportTeamsAndAliases
): string {
  return JSON.stringify(state, jsonReplacer, 2);
}

export function jsonToExportableState(json: string): ExportableState {
  const result = JSON.parse(json, jsonReviver);
  if (typeof result !== "object") {
    throw new Error("Json wasn't an object");
  }
  if (!result["formatVersion"]) {
    throw new Error("Json had no version - probably not a state file");
  }
  return result as ExportableState;
}

export function jsonToStandaloneTeamsAndAliases(
  json: string
): StandaloneExportTeamsAndAliases {
  const result = JSON.parse(json, jsonReviver);
  if (typeof result !== "object") {
    throw new Error("Json wasn't an object");
  }
  if (!result["formatVersion"]) {
    throw new Error("Json had no version - probably not a user file");
  }
  return result as StandaloneExportTeamsAndAliases;
}
