import { describe, expect, it } from "vitest";

import {
  FORMAT_FILE_VERSION,
  stateFromExportable,
  stateToExportable,
} from "./exportImport";
import { SUPPORTED_FILE_VERSION, UserData } from "./polyglot_data.types";
import { State } from "./state";
import {
  minimalFileNode,
  minimalPolyglotData,
  minimalState,
  vizMetadata,
} from "./testFixtures";

// The whole point of this format is that a saved set of teams and aliases can be loaded against
// a *different* scan of the same codebase, where the same people will have been given different
// numeric ids. So users are written out as name/email and looked back up by that - never by id.

const ALICE: UserData = { id: 0, name: "Alice", email: "alice@example.com" };
const BOB: UserData = { id: 1, name: "Bob", email: "bob@example.com" };
const CAROL: UserData = { id: 2, name: "Carol", email: "carol@example.com" };

function reindexed(users: UserData[]): UserData[] {
  return users.map((user, id) => ({ ...user, id }));
}

function stateWithTeams(users: UserData[]): State {
  const state = minimalState();
  const { teamsAndAliases } = state.config;
  teamsAndAliases.teams.set("backend", {
    users: new Set(users.filter((u) => u.name !== "Carol").map((u) => u.id)),
    colour: "#ff0000",
    hidden: false,
  });
  teamsAndAliases.ignoredUsers.add(users.find((u) => u.name === "Carol")!.id);
  return state;
}

function roundTrip(exportUsers: UserData[], importUsers: UserData[]) {
  const exportable = stateToExportable(
    minimalPolyglotData(minimalFileNode("root", "")),
    stateWithTeams(exportUsers),
    vizMetadata({ users: exportUsers })
  );
  // Serialised and re-parsed the way SaveLoadControls does it, so the test can't accidentally
  // pass by sharing live Maps and Sets between the two halves.
  const parsed = JSON.parse(JSON.stringify(exportable)) as typeof exportable;
  return stateFromExportable(
    vizMetadata({ users: importUsers }),
    parsed,
    false
  );
}

describe("saving and reloading state", () => {
  it("restores teams and ignored users against the same user list", () => {
    const users = [ALICE, BOB, CAROL];
    const { state, messages } = roundTrip(users, users);

    expect(messages).toEqual([]);
    const { teams, ignoredUsers } = state!.config.teamsAndAliases;
    expect(teams.get("backend")).toEqual({
      users: new Set([ALICE.id, BOB.id]),
      colour: "#ff0000",
      hidden: false,
    });
    expect(ignoredUsers).toEqual(new Set([CAROL.id]));
  });

  // The reason the format stores names rather than ids: a rescan reorders the user list, and a
  // saved team has to follow the people, not the slots they happened to occupy.
  it("follows people, not ids, when the user list has been reordered", () => {
    const { state, messages } = roundTrip(
      reindexed([ALICE, BOB, CAROL]),
      reindexed([CAROL, ALICE, BOB])
    );

    expect(messages).toEqual([]);
    // Alice and Bob are now ids 1 and 2, Carol is 0
    expect(state!.config.teamsAndAliases.teams.get("backend")!.users).toEqual(
      new Set([1, 2])
    );
    expect(state!.config.teamsAndAliases.ignoredUsers).toEqual(new Set([0]));
  });

  it("reports a saved user who isn't in the data being loaded, and refuses the load", () => {
    const { state, messages } = roundTrip(
      reindexed([ALICE, BOB, CAROL]),
      reindexed([ALICE, CAROL])
    );

    expect(state).toBeUndefined();
    expect(messages.map((m) => m.message)).toContainEqual(
      expect.stringContaining("Bob")
    );
  });

  it("refuses a state file written by a different release of the format", () => {
    const exportable = stateToExportable(
      minimalPolyglotData(minimalFileNode("root", "")),
      minimalState(),
      vizMetadata({ users: [] })
    );
    const { state, messages } = stateFromExportable(
      vizMetadata({ users: [] }),
      { ...exportable, formatVersion: "0.0.1" },
      false
    );

    expect(state).toBeUndefined();
    expect(messages.map((m) => m.message)).toContainEqual(
      expect.stringContaining(FORMAT_FILE_VERSION)
    );
  });

  it("refuses a state file saved against an unsupported data version", () => {
    const exportable = stateToExportable(
      minimalPolyglotData(minimalFileNode("root", "")),
      minimalState(),
      vizMetadata({ users: [] })
    );
    const { state, messages } = stateFromExportable(
      vizMetadata({ users: [] }),
      { ...exportable, dataVersion: "0.0.1" },
      false
    );

    expect(state).toBeUndefined();
    expect(messages.map((m) => m.message)).toContainEqual(
      expect.stringContaining(SUPPORTED_FILE_VERSION)
    );
  });

  // `tolerant` is what the UI uses when the user has explicitly chosen to load an imperfect file:
  // the same complaints are made, but the load goes through.
  it("loads anyway, still complaining, when asked to be tolerant", () => {
    const exportable = stateToExportable(
      minimalPolyglotData(minimalFileNode("root", "")),
      minimalState(),
      vizMetadata({ users: [] })
    );
    const { state, messages } = stateFromExportable(
      vizMetadata({ users: [] }),
      { ...exportable, formatVersion: "0.0.1" },
      true
    );

    expect(state).toBeDefined();
    expect(messages.length).toBeGreaterThan(0);
  });
});
