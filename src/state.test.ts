import { describe, expect, it } from "vitest";

import { getUserData, globalDispatchReducer, State, Teams } from "./state";
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

// `getUserData` resolves an id to a person, and has to tell a real user from an alias. Real users
// come from the data file's list, indexed by id; aliases are created in the UI and live in
// `config.teamsAndAliases.aliasData`, with ids allocated from `users.length` upward.
describe("looking a user up by id", () => {
  const ALICE = { id: 0, name: "Alice", email: "alice@example.com" };
  const BOB = { id: 1, name: "Bob", email: "bob@example.com" };

  it("finds a real user through the id index", () => {
    const metadata = vizMetadata({ users: [ALICE, BOB] });

    expect(getUserData(metadata, minimalState(), 1)).toEqual(BOB);
  });

  it("finds an alias, whose id is past the end of the real user list", () => {
    const metadata = vizMetadata({ users: [ALICE, BOB] });
    const state = minimalState();
    const alias = { id: 2, name: "Robert", email: "bob@work.example.com" };
    state.config.teamsAndAliases.aliasData.set(2, alias);

    expect(getUserData(metadata, state, 2)).toEqual(alias);
  });

  // The message used to read `Invalid user id #{userId}` - Ruby interpolation in a JavaScript
  // template string, so it reported the literal text and never the id that was actually bad.
  it("names the offending id when there is no such user", () => {
    const metadata = vizMetadata({ users: [ALICE, BOB] });
    const state = minimalState();

    expect(() => getUserData(metadata, state, 5)).toThrowError(
      "Invalid user id 5"
    );
  });
});
