import {
  NO_TEAM_SYMBOL,
  nodeChangersByTeam,
  topTeamsPartitioned,
  UserStats,
} from "./nodeData";
import { FileNode, GitData, LocData, NodeLayout } from "./polyglot_data.types";
import { UserAliases, UserTeams } from "./state";

const EMPTY_LAYOUT: NodeLayout = {
  algorithm: "test",
  center: [0, 0],
  polygon: [],
};
const DUMMY_LOC: LocData = {
  language: "test",
  binary: false,
  blanks: 1,
  code: 2,
  comments: 3,
  lines: 4,
  bytes: 5,
};
function minimalFileNode(name: string, path: string): FileNode {
  return {
    name,
    path,
    layout: EMPTY_LAYOUT,
    value: 0,
    data: {
      loc: DUMMY_LOC,
    },
  };
}
function minimalGitData(): GitData {
  return {
    last_update: 0,
    age_in_days: 0,
    user_count: 0,
    users: [],
    details: [],
    activity: [],
  };
}

function minimalNodeChangersParams() {
  const fileNode = minimalFileNode("foo", "bar");
  fileNode.data.git = minimalGitData();
  const aliases: UserAliases = new Map();
  const ignoredUsers: Set<number> = new Set();
  const userTeams: UserTeams = new Map();
  const earliest = 0;
  const latest = 100;
  return { fileNode, aliases, ignoredUsers, userTeams, earliest, latest };
}

describe("aggregating node info by team", () => {
  test("minimal data returns empty results", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      false
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map();
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate basic team stats", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA", "teamB"]));
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      true
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["teamB", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate more complex team stats", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA"]));
    userTeams.set(1, new Set(["teamB"]));
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0, 1],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      true
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["teamB", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate overlapping teams", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA"]));
    userTeams.set(1, new Set(["teamB"]));
    userTeams.set(2, new Set(["teamA", "teamB"]));
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0, 1],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    fileNode.data.git!.details!.push({
      commit_day: 2,
      users: [1, 2],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    fileNode.data.git!.details!.push({
      commit_day: 3,
      users: [1],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      true
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 2, lines: 4, days: new Set([1, 2]), files: 1 }],
      ["teamB", { commits: 3, lines: 6, days: new Set([1, 2, 3]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("users with no team get special 'no team' category", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA"]));
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    fileNode.data.git!.details!.push({
      commit_day: 2,
      users: [1],
      commits: 3,
      lines_added: 3,
      lines_deleted: 4,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      true
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["<NO TEAM>", { commits: 3, lines: 7, days: new Set([2]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("users with no team ignored if wanted", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA"]));
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    fileNode.data.git!.details!.push({
      commit_day: 2,
      users: [1],
      commits: 3,
      lines_added: 3,
      lines_deleted: 4,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      false
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("ignored users are ignored", () => {
    const { fileNode, aliases, ignoredUsers, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    userTeams.set(0, new Set(["teamA", "teamB"]));
    ignoredUsers.add(1);
    fileNode.data.git!.details!.push({
      commit_day: 1,
      users: [0, 1],
      commits: 1,
      lines_added: 1,
      lines_deleted: 1,
    });
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      true
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStats> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["teamB", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
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
