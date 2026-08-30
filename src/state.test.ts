import { describe, expect, it } from "vitest";

import { globalDispatchReducer, State, Teams } from "./state";
import {
  minimalFileNode,
  minimalPolyglotData,
  minimalState,
  vizMetadata,
} from "./testFixtures";
import { VizData, VizDataRef } from "./viz.types";

// `postprocessState` recomputes the derived `calculated` data only when the inputs it depends on
// actually changed, diffed with lodash `isEqual` - deliberate, because recomputing eagerly is too
// slow on a large tree (CLAUDE.md). These tests go through the real reducer and check both
// halves of that: the recompute happens when it must, and is skipped when it needn't.
//
// A cache is observed by poisoning it: `calculated` is seeded with a value that could never be
// derived from the config, so a stale value is visible as itself rather than as a coincidence.

const POISON = new Map([
  [999, new Set(["a team that no config would produce"])],
]);

function dispatcher() {
  const data = minimalPolyglotData(minimalFileNode("root", ""));
  const vizData: VizData = { data, metadata: vizMetadata() };
  const dataRef: VizDataRef = { current: vizData };
  return globalDispatchReducer(dataRef);
}

function poisoned(): State {
  const state = minimalState();
  state.calculated.userTeams = POISON;
  // initialiseGlobalState sets this, and it forces a full recompute on the first dispatch
  state.calculated.forceRecalculateAll = false;
  return state;
}

function teamsWith(name: string, userIds: number[]): Teams {
  return new Map([
    [name, { users: new Set(userIds), colour: "#000000", hidden: false }],
  ]);
}

describe("postprocessing state after a dispatch", () => {
  it("leaves the derived data alone when nothing it depends on changed", () => {
    const next = dispatcher()(poisoned(), { type: "setDepth", payload: 3 });

    expect(next.calculated.userTeams).toBe(POISON);
  });

  it("rebuilds the user-to-team lookup when teams change", () => {
    const next = dispatcher()(poisoned(), {
      type: "setUserTeamAliasData",
      payload: {
        teams: teamsWith("backend", [7]),
        aliases: new Map(),
        ignoredUsers: new Set(),
        aliasData: new Map(),
        noTeamColour: "#ffffff",
      },
    });

    expect(next.calculated.userTeams).toEqual(
      new Map([[7, new Set(["backend"])]])
    );
  });

  // The date range feeds the team lookup *and* the file maxima, so a date change has to
  // invalidate both - it is the one input two different caches share.
  it("rebuilds derived data when the date range changes", () => {
    const next = dispatcher()(poisoned(), {
      type: "setDateRange",
      payload: [1000, 2000],
    });

    expect(next.calculated.userTeams).not.toBe(POISON);
    expect(next.calculated.userTeams).toEqual(new Map());
  });

  it("rebuilds everything when forceRecalculateAll is set, then clears the flag", () => {
    const state = poisoned();
    state.calculated.forceRecalculateAll = true;

    const next = dispatcher()(state, { type: "setDepth", payload: 3 });

    expect(next.calculated.userTeams).not.toBe(POISON);
    expect(next.calculated.forceRecalculateAll).toBe(false);
  });

  it("does not mutate the state it was handed", () => {
    const state = poisoned();

    dispatcher()(state, {
      type: "setUserTeamAliasData",
      payload: {
        teams: teamsWith("backend", [7]),
        aliases: new Map(),
        ignoredUsers: new Set(),
        aliasData: new Map(),
        noTeamColour: "#ffffff",
      },
    });

    expect(state.calculated.userTeams).toBe(POISON);
  });
});
