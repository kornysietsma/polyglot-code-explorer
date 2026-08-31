import { describe, expect, it, vi } from "vitest";

import { minimalPageState, pageStateUser, teamsOf } from "../testFixtures";
import { colourSchemes } from "./colourSchemes";
import {
  addUsersToTeam,
  createTeam,
  ignoreCheckedUsers,
  recolourTeams,
  removeUsersFromTeam,
  renameTeam,
  selectAllVisibleUsers,
  selectColourScheme,
  selectTeamMembers,
  setTeamHidden,
  teamsForUserIncludingHidden,
  unIgnoreCheckedUsers,
  validTeamChange,
} from "./pageStateEdits";

const NEUTRAL = "#808080";

const threeUsers = [
  pageStateUser(0, { name: "Ann" }),
  pageStateUser(1, { name: "Bo" }),
  pageStateUser(2, { name: "Cy" }),
];

describe("creating a team", () => {
  it("names a one-user team after that user", () => {
    const next = createTeam(
      minimalPageState({
        usersAndAliases: threeUsers,
        checkedUsers: new Set([1]),
      }),
      NEUTRAL
    );

    expect([...next.teams.keys()]).toEqual(["Bo"]);
    expect(next.teams.get("Bo")).toEqual({
      users: new Set([1]),
      colour: NEUTRAL,
      hidden: false,
    });
  });

  it("gives a multi-user team a generated name", () => {
    const next = createTeam(
      minimalPageState({
        usersAndAliases: threeUsers,
        checkedUsers: new Set([0, 1]),
      }),
      NEUTRAL
    );

    expect([...next.teams.keys()]).toEqual(["team 1"]);
    expect(next.teams.get("team 1")!.users).toEqual(new Set([0, 1]));
  });

  // Teams can be renamed, so the generated name can already be taken. One existing team means
  // the generated name is "team 2"; when that is the taken one, a suffix is appended until it
  // is free.
  it("works around a name the user has already taken", () => {
    const next = createTeam(
      minimalPageState({
        usersAndAliases: threeUsers,
        checkedUsers: new Set([0, 1]),
        teams: teamsOf(["team 2", []]),
      }),
      NEUTRAL
    );

    expect([...next.teams.keys()]).toEqual(["team 2", "team 23"]);
  });

  it("clears the selection, so the next edit starts fresh", () => {
    const next = createTeam(
      minimalPageState({
        usersAndAliases: threeUsers,
        checkedUsers: new Set([1]),
      }),
      NEUTRAL
    );

    expect(next.checkedUsers).toEqual(new Set());
  });
});

describe("renaming a team", () => {
  const pageState = () =>
    minimalPageState({ teams: teamsOf(["red", [0]], ["blue", [1]]) });

  it("allows a free name", () => {
    expect(validTeamChange(pageState().teams, "red", "green")).toBeUndefined();
  });

  it("allows a no-op rename, so the confirm button is not stuck disabled", () => {
    expect(validTeamChange(pageState().teams, "red", "red")).toBeUndefined();
  });

  it("refuses a blank or duplicate name, saying why", () => {
    expect(validTeamChange(pageState().teams, "red", "  ")).toBe(
      "cannot be blank"
    );
    expect(validTeamChange(pageState().teams, "red", "blue")).toBe(
      "name already in use"
    );
  });

  it("moves the team's members and colour to the new name", () => {
    const next = renameTeam(pageState(), "red", "green");

    expect([...next.teams.keys()].sort()).toEqual(["blue", "green"]);
    expect(next.teams.get("green")!.users).toEqual(new Set([0]));
  });

  it("refuses a rename that validation would have rejected", () => {
    expect(() => renameTeam(pageState(), "red", "blue")).toThrow(
      "invalid team name change"
    );
  });
});

describe("team membership", () => {
  const pageState = () =>
    minimalPageState({
      usersAndAliases: threeUsers,
      teams: teamsOf(["red", [0]]),
      checkedUsers: new Set([1, 2]),
    });

  it("adds the selected users", () => {
    expect(addUsersToTeam(pageState(), "red").teams.get("red")!.users).toEqual(
      new Set([0, 1, 2])
    );
  });

  it("removes the selected users, leaving the rest", () => {
    const state = pageState();
    state.teams.get("red")!.users.add(1);

    expect(removeUsersFromTeam(state, "red").teams.get("red")!.users).toEqual(
      new Set([0])
    );
  });

  it("refuses a team that does not exist", () => {
    expect(() => addUsersToTeam(pageState(), "purple")).toThrow(
      "invalid team name"
    );
    expect(() => removeUsersFromTeam(pageState(), "purple")).toThrow(
      "invalid team name"
    );
  });

  it("selects a team's members", () => {
    expect(selectTeamMembers(pageState(), "red").checkedUsers).toEqual(
      new Set([0])
    );
  });

  it("hides a team without changing its members", () => {
    const next = setTeamHidden(pageState(), "red", true);

    expect(next.teams.get("red")!.hidden).toBe(true);
    expect(next.teams.get("red")!.users).toEqual(new Set([0]));
  });

  // Unlike the team lists elsewhere in the app: this panel is where hiding is configured, so it
  // has to show what is hidden.
  it("lists a user's teams including hidden ones", () => {
    const teams = teamsOf(["red", [0]], ["blue", [0], { hidden: true }]);

    expect(teamsForUserIncludingHidden(teams, 0).map(([name]) => name)).toEqual(
      ["red", "blue"]
    );
    expect(teamsForUserIncludingHidden(teams, 1)).toEqual([]);
  });
});

describe("selecting users", () => {
  it("selects only the users the filter is showing", () => {
    const next = selectAllVisibleUsers(
      minimalPageState({
        usersAndAliases: threeUsers,
        userFilter: "b",
      })
    );

    expect(next.checkedUsers).toEqual(new Set([1]));
  });
});

describe("ignoring users", () => {
  const pageState = () =>
    minimalPageState({
      usersAndAliases: threeUsers,
      teams: teamsOf(["red", [0, 1]], ["blue", [1]]),
      checkedUsers: new Set([1]),
    });

  it("ignores the selected users and drops them from every team", () => {
    const next = ignoreCheckedUsers(pageState());

    expect(next.ignoredUsers).toEqual(new Set([1]));
    expect(next.teams.get("red")!.users).toEqual(new Set([0]));
    expect(next.teams.get("blue")!.users).toEqual(new Set());
    expect(next.checkedUsers).toEqual(new Set());
  });

  it("refuses to ignore an alias, or a user already aliased to one", () => {
    const withAlias = minimalPageState({
      usersAndAliases: [...threeUsers, pageStateUser(3, { isAlias: true })],
      checkedUsers: new Set([3]),
    });
    expect(() => ignoreCheckedUsers(withAlias)).toThrow(
      "can't ignore alias user"
    );

    const aliased = minimalPageState({
      usersAndAliases: threeUsers,
      aliases: new Map([[1, 3]]),
      checkedUsers: new Set([1]),
    });
    expect(() => ignoreCheckedUsers(aliased)).toThrow(
      "can't ignore aliased user"
    );
  });

  // Deliberate: the teams a user was dropped from are not restored, since the panel has no
  // record of which those were.
  it("un-ignores without putting the user back into their old teams", () => {
    const ignored = ignoreCheckedUsers(pageState());
    const next = unIgnoreCheckedUsers({
      ...ignored,
      checkedIgnoredUsers: new Set([1]),
    });

    expect(next.ignoredUsers).toEqual(new Set());
    expect(next.teams.get("red")!.users).toEqual(new Set([0]));
    expect(next.checkedIgnoredUsers).toEqual(new Set());
  });
});

describe("auto-colouring teams", () => {
  const firstScheme = colourSchemes[0]![1];

  it("gives every shown team a colour from the chosen scheme", () => {
    const next = recolourTeams(
      minimalPageState({
        teams: teamsOf(["red", [0]], ["blue", [1]]),
        colourScheme: 0,
      }),
      NEUTRAL
    );

    const colours = [...next.teams.values()].map((team) => team.colour);
    expect(new Set(colours).size).toBe(2);
    for (const colour of colours) {
      expect(firstScheme).toContain(colour);
    }
  });

  it("leaves hidden teams alone, and keeps them in the map", () => {
    const next = recolourTeams(
      minimalPageState({
        teams: teamsOf(["red", [0]], ["hidden", [1], { hidden: true }]),
        colourScheme: 0,
      }),
      NEUTRAL
    );

    expect(next.teams.get("hidden")!.colour).toBe("#000000");
    expect(next.teams.get("red")!.colour).not.toBe("#000000");
  });

  it("falls back to the neutral colour once the scheme runs out", () => {
    const tooMany: [string, number[]][] = Array.from(
      { length: firstScheme.length + 2 },
      (_unused, index) => [`team ${index}`, [index]]
    );
    const next = recolourTeams(
      minimalPageState({ teams: teamsOf(...tooMany), colourScheme: 0 }),
      NEUTRAL
    );

    const neutrals = [...next.teams.values()].filter(
      (team) => team.colour === NEUTRAL
    );
    expect(neutrals).toHaveLength(2);
  });

  it("says so and changes nothing when every team is hidden", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const pageState = minimalPageState({
      teams: teamsOf(["red", [0], { hidden: true }]),
    });

    expect(recolourTeams(pageState, NEUTRAL)).toBe(pageState);
    expect(log).toHaveBeenCalledWith("Can't recolour teams as none are shown");
    log.mockRestore();
  });

  it("refuses a colour scheme that does not exist", () => {
    expect(() => selectColourScheme(minimalPageState(), -1)).toThrow(
      "impossible colour scheme"
    );
    expect(() =>
      selectColourScheme(minimalPageState(), colourSchemes.length)
    ).toThrow("impossible colour scheme");
    expect(selectColourScheme(minimalPageState(), 2).colourScheme).toBe(2);
  });
});
