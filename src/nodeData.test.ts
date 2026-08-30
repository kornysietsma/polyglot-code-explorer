import { describe, expect, it, test } from "vitest";

import {
  filesHaveMaxCommonRoots,
  NO_TEAM_SYMBOL,
  nodeChangersByTeam,
  nodeSingleTeam,
  topTeamsPartitioned,
  UserStats,
} from "./nodeData";
import { GitDetails } from "./polyglot_data.types";
import { FileChangeMetric, UserAliases, UserTeams } from "./state";
import { gitDetails, minimalFileNode, minimalGitData } from "./testFixtures";

// The date window every fixture below sits inside; individual tests vary the commits, not the
// range, so the range is a constant rather than another thing each test has to thread through.
const EARLIEST = 0;
const LATEST = 100;

function changersByTeam({
  details,
  userTeams = new Map(),
  ignoredUsers = new Set(),
  includeNonTeamChanges = true,
}: {
  details: GitDetails[];
  userTeams?: UserTeams;
  ignoredUsers?: Set<number>;
  includeNonTeamChanges?: boolean;
}) {
  const fileNode = minimalFileNode("foo", "bar", {
    data: { git: minimalGitData(details) },
  });
  const aliases: UserAliases = new Map();
  return nodeChangersByTeam(
    fileNode,
    aliases,
    ignoredUsers,
    userTeams,
    EARLIEST,
    LATEST,
    includeNonTeamChanges
  );
}

// The shape nodeChangersByTeam accumulates into, spelled out per team in the expectations below.
function teamTotals(commits: number, lines: number, days: number[]): UserStats {
  return { commits, lines, days: new Set(days), files: 1 };
}

describe("aggregating node info by team", () => {
  test("a file with no commits has no team stats", () => {
    expect(changersByTeam({ details: [] })).toEqual(new Map());
  });

  test("a change by someone in two teams counts once for each of them", () => {
    const changers = changersByTeam({
      details: [gitDetails(1, [0])],
      userTeams: new Map([[0, new Set(["teamA", "teamB"])]]),
    });

    expect(changers).toEqual(
      new Map([
        ["teamA", teamTotals(1, 2, [1])],
        ["teamB", teamTotals(1, 2, [1])],
      ])
    );
  });

  // The reason this function exists rather than summing `nodeChangers`: one commit made by two
  // members of the same team is one change by that team, not two.
  test("a change by two people on the same team counts once, not twice", () => {
    const changers = changersByTeam({
      details: [gitDetails(1, [0, 1], { commits: 3 })],
      userTeams: new Map([
        [0, new Set(["teamA"])],
        [1, new Set(["teamA"])],
      ]),
    });

    expect(changers).toEqual(new Map([["teamA", teamTotals(3, 2, [1])]]));
  });

  test("accumulates commits, lines and distinct days across overlapping teams", () => {
    const changers = changersByTeam({
      details: [
        gitDetails(1, [0, 1]),
        gitDetails(2, [1, 2]),
        gitDetails(3, [1]),
      ],
      userTeams: new Map([
        [0, new Set(["teamA"])],
        [1, new Set(["teamB"])],
        [2, new Set(["teamA", "teamB"])],
      ]),
    });

    expect(changers).toEqual(
      new Map([
        ["teamA", teamTotals(2, 4, [1, 2])],
        ["teamB", teamTotals(3, 6, [1, 2, 3])],
      ])
    );
  });

  test("gathers changes by people with no team under a 'no team' heading", () => {
    const changers = changersByTeam({
      details: [
        gitDetails(1, [0]),
        gitDetails(2, [1], { commits: 3, lines_added: 3, lines_deleted: 4 }),
      ],
      userTeams: new Map([[0, new Set(["teamA"])]]),
    });

    expect(changers).toEqual(
      new Map([
        ["teamA", teamTotals(1, 2, [1])],
        [NO_TEAM_SYMBOL, teamTotals(3, 7, [2])],
      ])
    );
  });

  test("drops those changes entirely when non-team changes aren't wanted", () => {
    const changers = changersByTeam({
      details: [gitDetails(1, [0]), gitDetails(2, [1], { commits: 3 })],
      userTeams: new Map([[0, new Set(["teamA"])]]),
      includeNonTeamChanges: false,
    });

    expect(changers).toEqual(new Map([["teamA", teamTotals(1, 2, [1])]]));
  });

  test("ignores an ignored user's share of a shared commit", () => {
    const changers = changersByTeam({
      details: [gitDetails(1, [0, 1])],
      userTeams: new Map([[0, new Set(["teamA"])]]),
      ignoredUsers: new Set([1]),
    });

    expect(changers).toEqual(new Map([["teamA", teamTotals(1, 2, [1])]]));
  });
});

function testTeamStat(
  teamname: string,
  commits: number
): [name: string, stats: UserStats] {
  return [teamname, { commits, lines: 1, days: new Set(), files: 1 }];
}

describe("finding top teams as partitions", () => {
  test("returns single team if only one team returned", () => {
    const stats: Map<string, UserStats> = new Map([testTeamStat("foo", 1)]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual(["foo", "foo", "foo"]);
  });
  test("returns empty if no teams have data", () => {
    // empty map
    expect(topTeamsPartitioned(new Map(), "commits", 3, true)).toBeUndefined();
    // no stats in map
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 0),
      testTeamStat("bar", 0),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned).toBeUndefined();
  });
  test("returns three teams in alphabetical order if stats split evenly", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 1),
      testTeamStat("baz", 1),
      testTeamStat("bar", 1),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual(["bar", "baz", "foo"]);
  });
  test("returns team with 67% of total twice", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 67),
      testTeamStat("bar", 32),
      testTeamStat("baz", 1),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual(["bar", "foo", "foo"]);
  });
  test("won't include teams with less than 1/6 of total", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 9),
      testTeamStat("baz", 1),
      testTeamStat("bat", 1),
      testTeamStat("bag", 1),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual(["foo", "foo"]);
  });
  test("will include teams with quota of 1/6 of total", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 10),
      testTeamStat("baz", 1),
      testTeamStat("bat", 1),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual(["foo", "foo", "foo"]);
  });
  test("won't include NO_TEAM team if not wanted, though NO_TEAM stats used in totalling", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 9),
      testTeamStat(NO_TEAM_SYMBOL, 3),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      false
    );
    expect(partitioned!).toEqual(["foo", "foo"]);
  });
  test("will include NO_TEAM team requested", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("foo", 9),
      testTeamStat(NO_TEAM_SYMBOL, 3),
    ]);
    const partitioned: string[] | undefined = topTeamsPartitioned(
      stats,
      "commits",
      3,
      true
    );
    expect(partitioned!).toEqual([NO_TEAM_SYMBOL, "foo", "foo"]);
  });
});

function singleTeam({
  details,
  team = "teamA",
  metric,
  userTeams = new Map(),
}: {
  details: GitDetails[];
  team?: string;
  metric: FileChangeMetric;
  userTeams?: UserTeams;
}) {
  const fileNode = minimalFileNode("foo", "bar", {
    data: { git: minimalGitData(details) },
  });
  return nodeSingleTeam(
    fileNode,
    team,
    metric,
    new Map(),
    new Set(),
    userTeams,
    EARLIEST,
    LATEST
  );
}

// `nodeSingleTeam` splits a file's changes into "this team" and "everyone else" - the pair the
// single-team visualisation shades between. A change counts to the team if *any* of its authors
// is in it, so the two halves deliberately don't sum to the file's total.
describe("aggregating for a single team", () => {
  const onlyUserZeroIsInTeamA: UserTeams = new Map([[0, new Set(["teamA"])]]);

  test("a file with no commits has no split to report", () => {
    expect(singleTeam({ details: [], metric: "commits" })).toBeUndefined();
  });

  test("counts commits and lines separately for the team and for everyone else", () => {
    const details = [
      gitDetails(1, [0], { lines_added: 2, lines_deleted: 3 }),
      gitDetails(1, [1]),
    ];

    expect(
      singleTeam({
        details,
        metric: "commits",
        userTeams: onlyUserZeroIsInTeamA,
      })
    ).toEqual([1, 1]);
    expect(
      singleTeam({ details, metric: "lines", userTeams: onlyUserZeroIsInTeamA })
    ).toEqual([5, 2]);
  });

  test("gives the team a commit it shares with someone outside it", () => {
    const result = singleTeam({
      details: [
        gitDetails(1, [0, 1], { commits: 2 }),
        gitDetails(2, [1], { commits: 3 }),
      ],
      metric: "commits",
      userTeams: onlyUserZeroIsInTeamA,
    });

    expect(result).toEqual([2, 3]);
  });

  test("counts days as distinct days rather than adding them up", () => {
    const result = singleTeam({
      details: [
        gitDetails(1, [0]),
        gitDetails(1, [0, 1], { commits: 2 }),
        gitDetails(2, [1]),
        gitDetails(3, [1]),
      ],
      metric: "days",
      userTeams: onlyUserZeroIsInTeamA,
    });

    // the team changed the file on one distinct day; others on two
    expect(result).toEqual([1, 2]);
  });
});

describe("filtering coupling by distance", () => {
  // The filter counts how many leading directories two files share, and keeps the pairs that
  // share at most that many - so a low setting shows only coupling that reaches across the
  // codebase, and a high one lets nearby files through too.
  it.each([
    // file1, file2, shared leading directories
    ["src/a.js", "test/a.js", 0],
    ["src/a.js", "src/b.js", 1],
    ["src/deep/a.js", "src/deep/b.js", 2],
    ["src/deep/a.js", "src/other/b.js", 1],
    // files at different depths: only the segments that exist in both can be shared
    ["src/a.js", "src/deep/b.js", 1],
    ["README.md", "src/a.js", 0],
    // a file against itself shares every one of its own segments and no more - the loop used to
    // run off the end of both arrays and count a phantom `undefined === undefined` match
    ["a", "a", 1],
    ["src/deep/a.js", "src/deep/a.js", 3],
  ])("%s and %s share %d roots", (file1, file2, shared) => {
    // shares exactly `shared`, so a limit of `shared` keeps it and one below drops it
    expect(filesHaveMaxCommonRoots(shared, file1, file2)).toBe(true);
    expect(filesHaveMaxCommonRoots(shared - 1, file1, file2)).toBe(
      // ...unless `shared - 1` is negative, which means "no filter" and keeps everything
      shared === 0
    );
  });

  test("a negative limit is the 'no filter' setting, not a limit of zero", () => {
    expect(filesHaveMaxCommonRoots(-1, "src/deep/a.js", "src/deep/b.js")).toBe(
      true
    );
  });
});

describe("top team partitions never exceed the partition count", () => {
  // The stripe palette only has room for `partitions` colours, and the result is sorted
  // alphabetically before it gets there - so an over-long list wouldn't merely be trimmed, it
  // would be trimmed by team *name*. Two teams with identical stats would then render
  // differently depending on what they were called.
  test("a dominant team plus a minority team still yields at most `partitions` entries", () => {
    const stats: Map<string, UserStats> = new Map([
      testTeamStat("zebra", 10),
      testTeamStat("aardvark", 2),
    ]);

    const partitioned = topTeamsPartitioned(stats, "commits", 3, true);

    expect(partitioned!.length).toBeLessThanOrEqual(3);
  });
});
