import { nodeChangersByTeam, UserStatsAccumulator } from "./nodeData";
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
  };
}

function minimalNodeChangersParams() {
  const fileNode = minimalFileNode("foo", "bar");
  fileNode.data.git = minimalGitData();
  const aliases: UserAliases = new Map();
  const userTeams: UserTeams = new Map();
  const earliest = 0;
  const latest = 100;
  return { fileNode, aliases, userTeams, earliest, latest };
}

describe("aggregating node info by team", () => {
  test("minimal data returns empty results", () => {
    const { fileNode, aliases, userTeams, earliest, latest } =
      minimalNodeChangersParams();
    const nodeChangers = nodeChangersByTeam(
      fileNode,
      aliases,
      userTeams,
      earliest,
      latest
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStatsAccumulator> = new Map();
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate basic team stats", () => {
    const { fileNode, aliases, userTeams, earliest, latest } =
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
      userTeams,
      earliest,
      latest
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStatsAccumulator> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["teamB", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate more complex team stats", () => {
    const { fileNode, aliases, userTeams, earliest, latest } =
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
      userTeams,
      earliest,
      latest
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStatsAccumulator> = new Map([
      ["teamA", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
      ["teamB", { commits: 1, lines: 2, days: new Set([1]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
  test("can aggregate overlapping teams", () => {
    const { fileNode, aliases, userTeams, earliest, latest } =
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
      userTeams,
      earliest,
      latest
    );
    expect(nodeChangers).toBeDefined();
    const expected: Map<string, UserStatsAccumulator> = new Map([
      ["teamA", { commits: 2, lines: 4, days: new Set([1, 2]), files: 1 }],
      ["teamB", { commits: 3, lines: 6, days: new Set([1, 2, 3]), files: 1 }],
    ]);
    expect(nodeChangers!).toEqual(expected);
  });
});
