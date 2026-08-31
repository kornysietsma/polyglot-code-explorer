// Every edit the Users and Teams panel can make to its own state: selecting users, creating and
// changing teams, and ignoring users. Each function takes the page state and returns the next
// one, so the component is left holding only the wiring.
//
// A caveat these inherit from the code they were extracted from, and that the `alreadyCloned`
// argument to `recalcStatsForPageState` exists to work around: several of them copy only the
// part of the state they change, and a few mutate the map or set they were given rather than
// replacing it. The returned state is always the one to use; the state passed in should be
// treated as spent.

import _ from "lodash";

import { Team, Teams } from "../state";
import { colourSchemeAt } from "./colourSchemes";
import { UsersAndTeamsPageState, UsersSort } from "./pageState";
import { userIsVisible } from "./userList";

// --- selecting users -------------------------------------------------------------------------

export function setUserChecked(
  pageState: UsersAndTeamsPageState,
  user: number,
  checked: boolean
): UsersAndTeamsPageState {
  const checkedUsers = pageState.checkedUsers;

  if (checked) {
    checkedUsers.add(user);
  } else {
    checkedUsers.delete(user);
  }
  return { ...pageState, checkedUsers };
}

export function setIgnoredUserChecked(
  pageState: UsersAndTeamsPageState,
  user: number,
  checked: boolean
): UsersAndTeamsPageState {
  const checkedIgnoredUsers = pageState.checkedIgnoredUsers;

  if (checked) {
    checkedIgnoredUsers.add(user);
  } else {
    checkedIgnoredUsers.delete(user);
  }
  return { ...pageState, checkedIgnoredUsers };
}

export function selectAllVisibleUsers(
  pageState: UsersAndTeamsPageState
): UsersAndTeamsPageState {
  const all = pageState.usersAndAliases
    .filter((user) => userIsVisible(pageState, user))
    .map((u) => u.id);
  return { ...pageState, checkedUsers: new Set(all) };
}

export function selectNoUsers(
  pageState: UsersAndTeamsPageState
): UsersAndTeamsPageState {
  return { ...pageState, checkedUsers: new Set() };
}

export function selectTeamMembers(
  pageState: UsersAndTeamsPageState,
  team: string
): UsersAndTeamsPageState {
  const users = pageState.teams.get(team)?.users;
  if (users == undefined) {
    throw new Error("logic error - invalid team name");
  }
  return { ...pageState, checkedUsers: new Set(users) };
}

// --- the shape of the user list --------------------------------------------------------------

export function setUsersSort(
  pageState: UsersAndTeamsPageState,
  usersSort: UsersSort
): UsersAndTeamsPageState {
  return { ...pageState, usersSort };
}

export function setUserFilter(
  pageState: UsersAndTeamsPageState,
  userFilter: string
): UsersAndTeamsPageState {
  return { ...pageState, userFilter };
}

export function setShowCheckedUsers(
  pageState: UsersAndTeamsPageState,
  showCheckedUsers: boolean
): UsersAndTeamsPageState {
  return { ...pageState, showCheckedUsers };
}

// --- teams -----------------------------------------------------------------------------------

/**
 * A team of the currently selected users, named after the user if there is exactly one, and
 * `team N` otherwise - with a numeric suffix appended until the name is free, since the user
 * can rename teams and so could have taken it already.
 */
export function createTeam(
  pageState: UsersAndTeamsPageState,
  neutralColour: string
): UsersAndTeamsPageState {
  let teamName =
    pageState.checkedUsers.size == 1
      ? pageState.usersAndAliases[pageState.checkedUsers.values().next().value!]
          ?.name
      : undefined;
  if (!teamName) {
    teamName = `team ${pageState.teams.size + 1}`;
  }
  // unlikely but if people have been fiddling with names could collide
  if (pageState.teams.has(teamName)) {
    let suffix = pageState.teams.size + 2;
    while (pageState.teams.has(teamName)) {
      teamName = `${teamName}${suffix}`;
      suffix += 1;
    }
  }
  const newTeams = pageState.teams;
  newTeams.set(teamName, {
    users: pageState.checkedUsers,
    colour: neutralColour,
    hidden: false,
  });
  return { ...pageState, teams: newTeams, checkedUsers: new Set() };
}

/** The reason a rename would be rejected, or undefined if it is allowed. */
export function validTeamChange(
  teams: Teams,
  oldName: string,
  newName: string
): string | undefined {
  if (oldName == newName) return undefined;
  if (newName.trim() == "") return "cannot be blank";
  if (teams.has(newName)) return "name already in use";
  return undefined;
}

export function renameTeam(
  pageState: UsersAndTeamsPageState,
  oldName: string,
  newName: string
): UsersAndTeamsPageState {
  if (validTeamChange(pageState.teams, oldName, newName) !== undefined) {
    throw new Error("logic error - invalid team name change");
  }
  const oldTeam = pageState.teams.get(oldName);
  if (oldTeam == undefined) {
    throw new Error("Logic error - invalid old team");
  }
  const { teams } = pageState;
  teams.set(newName, oldTeam);
  teams.delete(oldName);
  return { ...pageState, teams };
}

export function setTeamHidden(
  pageState: UsersAndTeamsPageState,
  team: string,
  hidden: boolean
): UsersAndTeamsPageState {
  const teams = _.clone(pageState.teams);

  teams.get(team)!.hidden = hidden;

  return { ...pageState, teams };
}

export function changeTeamColour(
  pageState: UsersAndTeamsPageState,
  name: string,
  value: string
): UsersAndTeamsPageState {
  const teams = _.cloneDeep(pageState.teams);
  const team = teams.get(name);
  if (team !== undefined) team.colour = value;
  return { ...pageState, teams };
}

export function setNoTeamColour(
  pageState: UsersAndTeamsPageState,
  noTeamColour: string
): UsersAndTeamsPageState {
  return { ...pageState, noTeamColour };
}

export function selectColourScheme(
  pageState: UsersAndTeamsPageState,
  colourScheme: number
): UsersAndTeamsPageState {
  colourSchemeAt(colourScheme); // throws if there is no such scheme
  return { ...pageState, colourScheme };
}

/**
 * Assigns the current scheme's colours to the shown teams, in a random order. Hidden teams keep
 * their colours, and shown teams past the end of the scheme get the neutral colour - note any
 * colours outside the colour range will be white! Remap those yourself...
 *
 * Returns the page state unchanged when no team is shown, since there is nothing to colour.
 */
export function recolourTeams(
  pageState: UsersAndTeamsPageState,
  neutralColour: string
): UsersAndTeamsPageState {
  let visibleTeams = [...pageState.teams].filter(([, team]) => !team.hidden);
  if (visibleTeams.length == 0) {
    console.log("Can't recolour teams as none are shown");
    return pageState;
  }
  const hiddenTeams = [...pageState.teams].filter(([, team]) => team.hidden);
  visibleTeams = _.shuffle(visibleTeams);

  const currentScheme = colourSchemeAt(pageState.colourScheme);

  visibleTeams.forEach(([, team], index) => {
    if (index < currentScheme.length) {
      team.colour = currentScheme[index]!;
    } else {
      team.colour = neutralColour;
    }
  });
  return {
    ...pageState,
    teams: new Map([...visibleTeams, ...hiddenTeams]),
  };
}

// --- team membership -------------------------------------------------------------------------

export function addUsersToTeam(
  pageState: UsersAndTeamsPageState,
  teamName: string
): UsersAndTeamsPageState {
  const teams = _.cloneDeep(pageState.teams);
  const team = teams.get(teamName);
  if (team == undefined) {
    throw new Error("logic error - invalid team name");
  }
  for (const user of pageState.checkedUsers) {
    team.users.add(user);
  }
  return { ...pageState, teams };
}

export function removeUsersFromTeam(
  pageState: UsersAndTeamsPageState,
  teamName: string
): UsersAndTeamsPageState {
  const teams = _.cloneDeep(pageState.teams);
  const team = teams.get(teamName);
  if (team == undefined) {
    throw new Error("logic error - invalid team name");
  }
  for (const user of pageState.checkedUsers) {
    team.users.delete(user);
  }
  return { ...pageState, teams };
}

/**
 * Unlike the team list shown elsewhere in the app, this includes hidden teams - the panel is
 * where hiding is configured, so it has to show what is hidden.
 */
export function teamsForUserIncludingHidden(
  teams: Teams,
  userId: number
): [name: string, data: Team][] {
  return [...teams].filter(([, teamData]) => teamData.users.has(userId));
}

// --- ignoring users --------------------------------------------------------------------------

/**
 * Ignored users are dropped from every team as well, which is why the button says so. Returns a
 * fully cloned state - see this module's header.
 */
export function ignoreCheckedUsers(
  pageState: UsersAndTeamsPageState
): UsersAndTeamsPageState {
  const newPageState = _.cloneDeep(pageState);
  for (const userId of pageState.checkedUsers) {
    if (pageState.aliases.has(userId)) {
      throw new Error("Logic error - can't ignore aliased user!");
    }
    if (pageState.usersAndAliases[userId]?.isAlias) {
      throw new Error("Logic error - can't ignore alias user!");
    }
    newPageState.ignoredUsers.add(userId);
  }
  const newTeams: Teams = new Map(
    [...newPageState.teams].map(([teamName, team]) => {
      for (const userId of pageState.checkedUsers) {
        team.users.delete(userId);
      }
      return [teamName, team];
    })
  );
  return {
    ...newPageState,
    teams: newTeams,
    checkedUsers: new Set(),
    checkedIgnoredUsers: new Set(),
  };
}

/** Un-ignoring does not put a user back into the teams they were dropped from. */
export function unIgnoreCheckedUsers(
  pageState: UsersAndTeamsPageState
): UsersAndTeamsPageState {
  const newIgnoredUsers = _.cloneDeep(pageState.ignoredUsers);
  for (const userId of pageState.checkedIgnoredUsers) {
    newIgnoredUsers.delete(userId);
  }
  return {
    ...pageState,
    ignoredUsers: newIgnoredUsers,
    checkedIgnoredUsers: new Set(),
  };
}
