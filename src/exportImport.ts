/* for exporting and importing aliases and teams to JSON
  Tries to avoid saving user IDs so the data can be imported
  to a different project with similar users.
  Not very reliable but sometimes worth it.
*/

import semver from "semver";

import { SUPPORTED_FILE_VERSION, Tree, UserData } from "./polyglot_data.types";
import {
  Config,
  CouplingConfig,
  errorMessage,
  ExpensiveConfig,
  getUserData,
  Message,
  State,
  Teams,
  UserAliasData,
  UserAliases,
} from "./state";
import { VizMetadata } from "./viz.types";

export const FORMAT_VERSION = "1.0.1";

export type ExportUser = {
  name: string;
  email: string;
};

/** for reverse indexes */
export function userAsKey(user: UserData | ExportUser) {
  return `${user.name}\t${user.email}`;
}

export type ExportTeam = {
  name: string;
  users: ExportUser[];
  colour: string;
  hidden: boolean;
};

export type UserExportData = {
  version: string;
  aliasData: ExportUser[];
  aliases: [user: ExportUser, aliasedTo: ExportUser][];
  teams: ExportTeam[];
};

type ExportableConfig = Omit<Config, "userData">;

type ExportableState = {
  dataVersion: string;
  formatVersion: string;
  name: string;
  id: string;
  config: ExportableConfig;
  couplingConfig: CouplingConfig;
  expensiveConfig: ExpensiveConfig;
  userData: UserExportData;
};

function toExportUser(
  users: UserData[],
  state: State,
  userId: number
): ExportUser {
  const user = getUserData(users, state, userId);
  return { name: user.name, email: user.email };
}

function exportableUserData(state: State, users: UserData[]): UserExportData {
  const toExport = (userId: number) => toExportUser(users, state, userId);

  const { userData } = state.config;
  const aliasData: ExportUser[] = [...userData.aliasData]
    .sort(([userIdA], [userIdB]) => userIdB - userIdA)
    .map(([, user]) => {
      return { name: user.name, email: user.email };
    });
  const aliases: [user: ExportUser, aliasedTo: ExportUser][] = [
    ...userData.aliases,
  ].map(([fromUser, toUser]) => [toExport(fromUser), toExport(toUser)]);
  const teams: ExportTeam[] = [...userData.teams].map(([teamName, team]) => {
    const users = [...team.users].map(toExport);
    return { name: teamName, users, colour: team.colour, hidden: team.hidden };
  });

  return {
    version: FORMAT_VERSION,
    aliasData,
    aliases,
    teams,
  };
}

export function stateToExportable(
  files: Tree,
  state: State,
  metadata: VizMetadata
): ExportableState {
  // explicitly save these parts of state - other parts might not be wanted
  const { userData: _unused, ...trimmedConfig } = state.config;
  const fixedConfig: ExportableConfig = {
    ...trimmedConfig,
  };

  return {
    dataVersion: files.version,
    formatVersion: FORMAT_VERSION,
    name: files.name,
    id: files.id,
    config: fixedConfig,
    expensiveConfig: state.expensiveConfig,
    couplingConfig: state.couplingConfig,
    userData: exportableUserData(state, metadata.users),
  };
}

export function stateFromExportable(
  metadata: VizMetadata,
  exportableState: ExportableState,
  tolerant: boolean
): { state?: State; messages: Message[] } {
  const { users } = metadata;
  let failed = false;

  const messages: Message[] = [];
  const { aliasData, aliases, teams } = exportableState.userData;

  if (exportableState.formatVersion != FORMAT_VERSION) {
    messages.push(
      errorMessage(
        `Invalid format version ${exportableState.formatVersion} - expected ${FORMAT_VERSION}`
      )
    );
    if (!tolerant) failed = true;
  }
  if (!semver.satisfies(exportableState.dataVersion, SUPPORTED_FILE_VERSION)) {
    messages.push(
      errorMessage(
        `Invalid data version ${exportableState.dataVersion} - this release of Explorer supports  ${SUPPORTED_FILE_VERSION}`
      )
    );
    if (!tolerant) failed = true;
  }

  const firstAliasId = users.length;
  const newAliasData: UserAliasData = new Map(
    aliasData.map((alias, index) => {
      const newId = index + firstAliasId;
      return [newId, { id: newId, name: alias.name, email: alias.email }];
    })
  );
  const reverseLookup: Map<string, number> = new Map();
  for (const user of users) {
    reverseLookup.set(userAsKey(user), user.id);
  }
  for (const alias of newAliasData.values()) {
    reverseLookup.set(userAsKey(alias), alias.id);
  }
  const lookupUser = (exportUser: ExportUser) => {
    const userMatch = reverseLookup.get(userAsKey(exportUser));

    if (userMatch == undefined) {
      messages.push(
        errorMessage(`Unknown user "${exportUser.name} <${exportUser.email}>"`)
      );
      if (!tolerant) failed = true;
      return undefined;
    }
    return userMatch;
  };

  const newTeams: Teams = new Map(
    teams.map((team) => {
      return [
        team.name,
        {
          colour: team.colour,
          users: new Set<number>(
            team.users.map(lookupUser).filter((u) => u != undefined) as number[]
          ),
          hidden: team.hidden,
        },
      ];
    })
  );
  const newAliases: UserAliases = new Map(
    aliases
      .map(([user, aliasedTo]) => {
        return [lookupUser(user), lookupUser(aliasedTo)];
      })
      .filter(([a, b]) => a != undefined && b != undefined) as [
      number,
      number
    ][]
  );
  const newUserData = {
    teams: newTeams,
    aliases: newAliases,
    aliasData: newAliasData,
  };
  const newConfig: Config = {
    ...exportableState.config,
    ...{ userData: newUserData },
  };
  const newState: State = {
    config: newConfig,
    couplingConfig: exportableState.couplingConfig,
    expensiveConfig: exportableState.expensiveConfig,
    calculated: {
      // calculated in dispatcher
      userTeams: new Map(),
    },
    messages,
  };
  return { state: failed ? undefined : newState, messages };
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
  return JSON.stringify(state, jsonReplacer);
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
