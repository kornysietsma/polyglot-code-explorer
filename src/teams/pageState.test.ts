import { describe, expect, it } from "vitest";

import { TeamsAndAliases } from "../state";
import {
  gitDetails,
  minimalDirectoryNode,
  minimalFileNode,
  minimalGitData,
  minimalPageState,
  pageStateUser,
  teamsOf,
} from "../testFixtures";
import {
  pageStateToSaveData,
  recalcStatsForPageState,
  usersAndTeamsToPageFormat,
} from "./pageState";

const DAY = 1554768000; // Tuesday 9 April 2019, 00:00 UTC
const EARLIEST = DAY - 86400;
const LATEST = DAY + 86400;

// Two files, so a user who touched both is distinguishable from one who touched one.
const tree = minimalDirectoryNode("", "", [
  minimalFileNode("a.txt", "a.txt", {
    data: {
      git: minimalGitData([
        gitDetails(DAY, [0, 1], {
          commits: 2,
          lines_added: 3,
          lines_deleted: 4,
        }),
      ]),
    },
  }),
  minimalFileNode("b.txt", "b.txt", {
    data: {
      git: minimalGitData([
        gitDetails(DAY, [1], { commits: 1, lines_added: 1, lines_deleted: 1 }),
      ]),
    },
  }),
]);

const users = [
  { id: 0, name: "Ann", email: "ann@example.com" },
  { id: 1, name: "Bo", email: "bo@example.com" },
];

function teamsAndAliases(
  overrides: Partial<TeamsAndAliases> = {}
): TeamsAndAliases {
  return {
    teams: new Map(),
    aliases: new Map(),
    aliasData: new Map(),
    ignoredUsers: new Set(),
    ...overrides,
  };
}

describe("building the page state from the global state", () => {
  it("gives every user their statistics for the date range", () => {
    const { usersAndAliases } = usersAndTeamsToPageFormat(
      tree,
      users,
      teamsAndAliases(),
      EARLIEST,
      LATEST,
      true
    );

    expect(usersAndAliases.map((u) => [u.name, u.files, u.lines])).toEqual([
      ["Ann", 1, 7],
      ["Bo", 2, 9],
    ]);
  });

  // The "refresh stats" checkbox exists because aggregating a large tree is slow.
  it("leaves the statistics at zero when it is told not to recalculate", () => {
    const { usersAndAliases, teamStats } = usersAndTeamsToPageFormat(
      tree,
      users,
      teamsAndAliases(),
      EARLIEST,
      LATEST,
      false
    );

    expect(usersAndAliases.map((u) => u.files)).toEqual([0, 0]);
    expect(teamStats).toBeUndefined();
  });

  it("appends aliases after the real users, in id order, flagged as aliases", () => {
    const { usersAndAliases } = usersAndTeamsToPageFormat(
      tree,
      users,
      teamsAndAliases({
        aliasData: new Map([
          [3, { id: 3, name: "Later", email: "later@example.com" }],
          [2, { id: 2, name: "Earlier", email: "earlier@example.com" }],
        ]),
      }),
      EARLIEST,
      LATEST,
      true
    );

    expect(usersAndAliases.map((u) => [u.name, u.isAlias])).toEqual([
      ["Ann", false],
      ["Bo", false],
      ["Earlier", true],
      ["Later", true],
    ]);
  });

  it("credits an aliased user's changes to the alias", () => {
    const { usersAndAliases } = usersAndTeamsToPageFormat(
      tree,
      users,
      teamsAndAliases({
        aliases: new Map([[1, 2]]),
        aliasData: new Map([
          [2, { id: 2, name: "Bo again", email: "bo2@example.com" }],
        ]),
      }),
      EARLIEST,
      LATEST,
      true
    );

    const byName = new Map(usersAndAliases.map((u) => [u.name, u]));
    expect(byName.get("Bo")!.files).toBe(0);
    expect(byName.get("Bo again")!.files).toBe(2);
  });

  it("counts a team's changes once, however many of its members made them", () => {
    const { teamStats } = usersAndTeamsToPageFormat(
      tree,
      users,
      teamsAndAliases({ teams: teamsOf(["both", [0, 1]]) }),
      EARLIEST,
      LATEST,
      true
    );

    // Ann and Bo share the commit on a.txt - two users, one team, one commit counted.
    expect(teamStats!.get("both")).toMatchObject({ files: 2, commits: 3 });
  });
});

describe("refreshing the statistics after an edit", () => {
  it("recomputes every user's stats against the current aliases and ignore list", () => {
    const stale = minimalPageState({
      usersAndAliases: [
        pageStateUser(0, { name: "Ann", files: 99 }),
        pageStateUser(1, { name: "Bo", files: 99 }),
      ],
      ignoredUsers: new Set([1]),
    });

    const next = recalcStatsForPageState(tree, EARLIEST, LATEST, stale, false);

    expect(next.usersAndAliases.map((u) => u.files)).toEqual([1, 0]);
  });

  it("leaves the state it was given alone unless told it was already cloned", () => {
    const stale = minimalPageState({
      usersAndAliases: [pageStateUser(0, { name: "Ann", files: 99 })],
    });

    recalcStatsForPageState(tree, EARLIEST, LATEST, stale, false);

    expect(stale.usersAndAliases[0]!.files).toBe(99);
  });
});

describe("what the panel saves", () => {
  it("hands back the teams, aliases and ignored users as edited", () => {
    const pageState = minimalPageState({
      usersAndAliases: [pageStateUser(0), pageStateUser(1)],
      teams: teamsOf(["red", [0]]),
      aliases: new Map([[1, 2]]),
      ignoredUsers: new Set([0]),
      noTeamColour: "#123456",
    });

    const saved = pageStateToSaveData(pageState);

    expect(saved.teams).toBe(pageState.teams);
    expect(saved.aliases).toBe(pageState.aliases);
    expect(saved.ignoredUsers).toBe(pageState.ignoredUsers);
    expect(saved.noTeamColour).toBe("#123456");
  });

  // Aliases are the one thing the panel invents rather than edits, so they are rebuilt from the
  // user rows - real users must not leak into `aliasData`.
  it("rebuilds the alias data from the alias rows alone", () => {
    const saved = pageStateToSaveData(
      minimalPageState({
        usersAndAliases: [
          pageStateUser(0, { name: "Ann" }),
          pageStateUser(2, { name: "An Alias", isAlias: true }),
        ],
      })
    );

    expect(saved.aliasData).toEqual(
      new Map([[2, { id: 2, name: "An Alias", email: "user2@example.com" }]])
    );
  });
});
