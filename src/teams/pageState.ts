// The Users and Teams panel's own state. The panel edits a private copy of the teams, aliases
// and ignored users and dispatches nothing until the user saves, so this is its whole working
// set - built from the global state when the modal opens, refreshed as edits are made, and
// converted back on save.
//
// The edits themselves live in `pageStateEdits.ts`; what the user list shows, in `userList.ts`.

import _ from "lodash";

import {
  aggregateTeamStats,
  aggregateUserStats,
  DEFAULT_USER_STATS,
  UserStats,
} from "../model/teamStats";
import { TreeNode, UserData } from "../polyglot_data.types";
import {
  Message,
  Teams,
  TeamsAndAliases,
  UserAliasData,
  UserAliases,
} from "../state";
import { Action } from "../state/actions";
import { buildUserTeams } from "../state/derived";

export type UserAndStatsAndAliases = UserData &
  UserStats & { isAlias: boolean };

export type UsersSort = { key: string; ascending: boolean };

export type UsersAndTeamsPageState = {
  usersAndAliases: UserAndStatsAndAliases[];
  aliases: UserAliases;
  teams: Teams;
  ignoredUsers: Set<number>;
  teamStats: Map<string, UserStats>;
  usersSort: UsersSort;
  checkedUsers: Set<number>;
  checkedIgnoredUsers: Set<number>;
  userFilter: string;
  showCheckedUsers: boolean;
  importMessages: Message[];
  colourScheme: number;
  noTeamColour: string;
};

export const initialPageState: () => UsersAndTeamsPageState = () => {
  return {
    usersAndAliases: [],
    teams: new Map(),
    ignoredUsers: new Set(),
    checkedIgnoredUsers: new Set(),
    teamStats: new Map(),
    aliases: new Map(),
    usersSort: { key: "files", ascending: true },
    checkedUsers: new Set(),
    userFilter: "",
    showCheckedUsers: false,
    importMessages: [],
    colourScheme: 0,
    noTeamColour: "#ffffff",
  };
};

/** converts users as stored in global state into format needed here, with stats */
export function usersAndTeamsToPageFormat(
  tree: TreeNode,
  users: UserData[],
  teamsAndAliases: TeamsAndAliases,
  earliest: number,
  latest: number,
  recalcStats: boolean
): {
  usersAndAliases: UserAndStatsAndAliases[];
  aliases: UserAliases;
  teams: Teams;
  ignoredUsers: Set<number>;
  teamStats?: Map<string, UserStats>;
} {
  const userStats = recalcStats
    ? aggregateUserStats(
        tree,
        earliest,
        latest,
        teamsAndAliases.aliases,
        teamsAndAliases.ignoredUsers
      )
    : undefined;
  const userTeams = buildUserTeams(teamsAndAliases.teams);
  const teamStats = recalcStats
    ? aggregateTeamStats(
        tree,
        earliest,
        latest,
        teamsAndAliases.aliases,
        teamsAndAliases.ignoredUsers,
        userTeams,
        false
      )
    : undefined;

  const usersWithStats: UserAndStatsAndAliases[] = users.map((user) => {
    const stats = userStats?.get(user.id);
    if (stats) {
      return { ...user, ...stats, isAlias: false };
    } else {
      return {
        ...user,
        ...DEFAULT_USER_STATS,
        isAlias: false,
      };
    }
  });
  const aliasUserData: UserAndStatsAndAliases[] = [...teamsAndAliases.aliasData]
    .sort(([aliasIdA], [aliasIdB]) => aliasIdA - aliasIdB)
    .map(([aliasId, userData]) => {
      const stats = userStats?.get(aliasId);
      if (stats) {
        return { ...userData, ...stats, isAlias: true };
      } else {
        return {
          ...userData,
          ...DEFAULT_USER_STATS,
          isAlias: true,
        };
      }
    });

  return {
    usersAndAliases: [...usersWithStats, ...aliasUserData],
    // Deep copies, and that is the whole point: the panel edits its state in place (see
    // `pageStateEdits.ts`), so handing it the global state's own `Map`s would let an edit reach
    // the rest of the app without a dispatch - and "cancel" could not undo it. A shallow copy
    // is not enough, because `setTeamHidden` writes to a `Team` inside the map.
    aliases: _.cloneDeep(teamsAndAliases.aliases),
    teams: _.cloneDeep(teamsAndAliases.teams),
    ignoredUsers: _.cloneDeep(teamsAndAliases.ignoredUsers),
    teamStats,
  };
}

/**
 * Recomputes every user's and team's statistics for the edits made so far.
 *
 * `alreadyCloned` says whether the caller has already deep-copied the state it is handing over:
 * this writes the refreshed stats into `usersAndAliases` in place, so a caller that only spread
 * the page state shallowly must say so, or the previous state's array is rewritten under it.
 * The `pageStateEdits` functions each pass what they actually did.
 */
export function recalcStatsForPageState(
  tree: TreeNode,
  earliest: number,
  latest: number,
  workingPageState: UsersAndTeamsPageState,
  alreadyCloned: boolean
): UsersAndTeamsPageState {
  const { aliases, ignoredUsers } = workingPageState;
  const userStats = aggregateUserStats(
    tree,
    earliest,
    latest,
    aliases,
    ignoredUsers
  );
  const userTeams = buildUserTeams(workingPageState.teams);
  const teamStats = aggregateTeamStats(
    tree,
    earliest,
    latest,
    workingPageState.aliases,
    ignoredUsers,
    userTeams,
    false
  );

  const newPageState = alreadyCloned
    ? workingPageState
    : _.cloneDeep(workingPageState);
  newPageState.usersAndAliases.forEach((user, index, arr) => {
    const stats = userStats.get(user.id);
    if (stats) {
      arr[index] = { ...user, ...stats };
    } else {
      arr[index] = { ...user, ...DEFAULT_USER_STATS };
    }
  });
  newPageState.teamStats = teamStats;
  return newPageState;
}

/** Everything the panel hands back to the global state when the user saves. */
export function pageStateToSaveData(
  pageState: UsersAndTeamsPageState
): Extract<Action, { type: "setUserTeamAliasData" }>["payload"] {
  const aliasData: UserAliasData = new Map();
  for (const user of pageState.usersAndAliases) {
    if (user.isAlias) {
      aliasData.set(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
      });
    }
  }

  return {
    teams: pageState.teams,
    aliases: pageState.aliases,
    ignoredUsers: pageState.ignoredUsers,
    aliasData,
    noTeamColour: pageState.noTeamColour,
  };
}

/**
 * What the panel's sections are handed. They read and edit the page state; the shell owns it,
 * and owns the decision of whether an edit recalculates statistics.
 *
 * `applyEdit`'s `alreadyCloned` is passed through to `recalcStatsForPageState` - see above.
 */
export type PageStateProps = {
  pageState: UsersAndTeamsPageState;
  setPageState: (newState: UsersAndTeamsPageState) => void;
  applyEdit: (
    newState: UsersAndTeamsPageState,
    alreadyCloned?: boolean
  ) => void;
};
