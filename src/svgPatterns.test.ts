import { describe, expect, it } from "vitest";

import { State, Teams } from "./state";
import { colourKeyToColours } from "./state/colours";
import { calculateSvgPatterns, SVG_PARTITIONS } from "./svgPatterns";
import {
  gitDetails,
  minimalDirectoryNode,
  minimalFileNode,
  minimalGitData,
  minimalPolyglotData,
  minimalState,
} from "./testFixtures";

// The `teamPattern` visualisation fills each file with a stripe pattern made from its top teams,
// split into SVG_PARTITIONS shares. Files whose top teams work out to the same colours share one
// pattern id, so the palette stays small on a big tree.

const RED = "#ff0000";
const BLUE = "#0000ff";

function team(colour: string, userIds: number[]) {
  return { users: new Set(userIds), colour, hidden: false };
}

function stateWithTeams(teams: Teams): State {
  const state = minimalState();
  state.config.teamsAndAliases.teams = teams;
  state.config.filters.dateRange = { earliest: 0, latest: 1000 };
  // the app's default is "lines"; commits are what these fixtures vary, so say so rather than
  // silently depending on `gitDetails`' line defaults
  state.config.fileChangeMetric = "commits";
  state.calculated.userTeams = new Map(
    [...teams].flatMap(([name, { users }]) =>
      [...users].map((id) => [id, new Set([name])] as [number, Set<string>])
    )
  );
  return state;
}

// One file per entry, each with a day's commits by the given users.
function treeOf(files: Record<string, number[]>) {
  return minimalPolyglotData(
    minimalDirectoryNode(
      "root",
      "",
      Object.entries(files).map(([path, users]) =>
        minimalFileNode(path, path, {
          data: { git: minimalGitData([gitDetails(1, users)]) },
        })
      )
    ),
    { git: true, git_details: true }
  );
}

function patternsFor(state: State, files: Record<string, number[]>) {
  const { svgPatternIds, svgPatternLookup } = calculateSvgPatterns(
    state,
    treeOf(files)
  );
  const coloursById = new Map(
    [...svgPatternIds].map(([key, id]) => [id, colourKeyToColours(key)])
  );
  return { svgPatternLookup, coloursById };
}

describe("building team stripe patterns", () => {
  it("gives a file dominated by one team that team's colour in every stripe", () => {
    const state = stateWithTeams(new Map([["red", team(RED, [0])]]));
    const { svgPatternLookup, coloursById } = patternsFor(state, {
      "a.ts": [0],
    });

    const patternId = svgPatternLookup.get("a.ts");
    expect(patternId).toBeDefined();
    expect(coloursById.get(patternId!)).toEqual(
      new Array(SVG_PARTITIONS).fill(RED)
    );
  });

  // `topTeamsPartitioned` drops teams below a share threshold, so a pattern can legitimately come
  // back with fewer colours than SVG_PARTITIONS - `buildPatternPalette` then fills the remaining
  // bands with the neutral colour. The renderer must not assume a fixed stripe count.
  it("allows a pattern with fewer colours than there are partitions", () => {
    const state = stateWithTeams(
      new Map([
        ["red", team(RED, [0])],
        ["blue", team(BLUE, [1])],
        ["green", team("#00ff00", [2])],
        ["yellow", team("#ffff00", [3])],
      ])
    );
    // 9 commits against three lots of 1: "red" earns two of the three stripes and nobody else
    // clears the half-share needed for the last one.
    const tree = minimalPolyglotData(
      minimalDirectoryNode("root", "", [
        minimalFileNode("a.ts", "a.ts", {
          data: {
            git: minimalGitData([
              gitDetails(1, [0], { commits: 9 }),
              gitDetails(2, [1], { commits: 1 }),
              gitDetails(3, [2], { commits: 1 }),
              gitDetails(4, [3], { commits: 1 }),
            ]),
          },
        }),
      ]),
      { git: true, git_details: true }
    );

    const { svgPatternIds } = calculateSvgPatterns(state, tree);
    const colours = [...svgPatternIds.keys()].map(colourKeyToColours);

    expect(colours.length).toBe(1);
    expect(colours[0]).toEqual([RED, RED]);
    expect(colours[0]!.length).toBeLessThan(SVG_PARTITIONS);
  });

  it("shares one pattern id between files whose top teams match", () => {
    const state = stateWithTeams(
      new Map([
        ["red", team(RED, [0])],
        ["blue", team(BLUE, [1])],
      ])
    );
    const { svgPatternLookup, coloursById } = patternsFor(state, {
      "a.ts": [0],
      "b.ts": [0],
      "c.ts": [1],
    });

    expect(svgPatternLookup.get("a.ts")).toBe(svgPatternLookup.get("b.ts"));
    expect(svgPatternLookup.get("c.ts")).not.toBe(svgPatternLookup.get("a.ts"));
    expect(coloursById.size).toBe(2);
  });

  it("leaves a file with no changes in range out of the lookup entirely", () => {
    const state = stateWithTeams(new Map([["red", team(RED, [0])]]));
    state.config.filters.dateRange = { earliest: 500, latest: 1000 };

    const { svgPatternLookup } = patternsFor(state, { "a.ts": [0] });

    // the renderer shows a missing entry as the neutral colour
    expect(svgPatternLookup.has("a.ts")).toBe(false);
  });
});
