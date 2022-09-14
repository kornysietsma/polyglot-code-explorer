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
});
