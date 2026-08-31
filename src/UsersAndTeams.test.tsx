import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import ReactModal from "react-modal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolyglotData, UserData } from "./polyglot_data.types";
import { Teams } from "./state";
import { Action } from "./state/actions";
import { initialiseGlobalState } from "./state/config";
import {
  gitDetails,
  minimalDirectoryNode,
  minimalFileNode,
  minimalGitData,
  minimalPolyglotData,
  vizMetadata,
} from "./testFixtures";
import UsersAndTeams from "./UsersAndTeams";
import { VizData, VizDataRef } from "./viz.types";

/**
 * Whole-panel tests, written *before* `UsersAndTeams.tsx` is broken up (plan.md step 6.1). They
 * drive the real panel through the DOM and assert on the single `setUserTeamAliasData` action it
 * dispatches on "save and close" - that action is the panel's entire output, so asserting on it
 * says what the panel is *for* without pinning down any markup the restructure will move.
 *
 * The two view-only behaviours - filtering and sorting - dispatch nothing, so they are checked
 * against the rendered user rows instead. That is the only markup these tests depend on.
 */

// Two commit days a day apart, well inside the date range `initialiseGlobalState` derives from
// the metadata stats below.
const DAY1 = 1554768000; // Tuesday 9 April 2019, 00:00 UTC
const DAY2 = DAY1 + 86400;

const USERS: UserData[] = [
  { id: 0, name: "Alice Adams", email: "alice@example.com" },
  { id: 1, name: "Bob Brown", email: "bob@example.com" },
  { id: 2, name: "Carol Clark", email: "carol@example.com" },
];

/**
 * Stats chosen so every sortable column ranks the three users differently, and so the *default*
 * sort (files, descending) is not the same order as any other:
 *
 * | user  | files | commits | days | lines |
 * | ----- | ----- | ------- | ---- | ----- |
 * | Alice |     1 |       3 |    1 |    15 |
 * | Bob   |     2 |       4 |    2 |    18 |
 * | Carol |     1 |       7 |    1 |   100 |
 */
function testData(): PolyglotData {
  const fileA = minimalFileNode("a.txt", "a.txt", {
    data: {
      git: minimalGitData([
        gitDetails(DAY1, [0, 1], {
          commits: 3,
          lines_added: 10,
          lines_deleted: 5,
        }),
      ]),
    },
  });
  const fileB = minimalFileNode("b.txt", "b.txt", {
    data: {
      git: minimalGitData([
        gitDetails(DAY1, [2], {
          commits: 7,
          lines_added: 100,
          lines_deleted: 0,
        }),
        gitDetails(DAY2, [1], { commits: 1, lines_added: 2, lines_deleted: 1 }),
      ]),
    },
  });
  return minimalPolyglotData(minimalDirectoryNode("", "", [fileA, fileB]), {
    git: true,
    git_details: true,
  });
}

function testDataRef(): VizDataRef {
  const vizData: VizData = {
    data: testData(),
    metadata: vizMetadata({
      users: USERS,
      stats: { maxDepth: 2, maxLoc: 10, earliest: DAY1, latest: DAY2 },
    }),
  };
  return { current: vizData };
}

// react-modal hides the app element while a modal is open, and Testing Library's role queries
// skip anything `aria-hidden`. So the panel renders into its own container, registered as the
// app element, leaving the modal - which portals to `document.body` - visible to queries.
let appRoot: HTMLDivElement;

function renderPanel({ strict = false } = {}) {
  const dataRef = testDataRef();
  const state = initialiseGlobalState(dataRef);
  const dispatch = vi.fn<(action: Action) => void>();
  const panel = (
    <UsersAndTeams dataRef={dataRef} state={state} dispatch={dispatch} />
  );
  render(strict ? <StrictMode>{panel}</StrictMode> : panel, {
    container: appRoot,
  });
  return { dispatch };
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Users and Teams" }));
}

function saveAndClose() {
  fireEvent.click(screen.getByRole("button", { name: "save and close" }));
}

/** The one action the panel ever dispatches; unwrapped so tests can assert on its payload. */
function savedPayload(dispatch: ReturnType<typeof vi.fn>) {
  expect(dispatch).toHaveBeenCalledTimes(1);
  const action = dispatch.mock.calls[0]![0] as Action;
  if (action.type !== "setUserTeamAliasData") {
    throw new Error(`unexpected action ${action.type}`);
  }
  return action.payload;
}

// Each table is found by a column heading unique to it, rather than by position or class.
const usersTable = () =>
  screen
    .getByRole("columnheader", { name: "Lines changed total" })
    .closest("table")!;
const teamsTable = () =>
  screen.getByRole("columnheader", { name: "Hidden" }).closest("table")!;
const ignoredUsersTable = () =>
  screen.getByRole("columnheader", { name: "email" }).closest("table")!;

function bodyRows(table: HTMLElement): HTMLTableRowElement[] {
  return within(table).getAllByRole("row").slice(1) as HTMLTableRowElement[];
}

/** The Name column of the users table, in the order the table currently shows it. */
function shownUserNames(): string[] {
  return bodyRows(usersTable()).map((row) => row.cells[2]!.textContent);
}

/**
 * Rows are matched on the Name *column* rather than on the row's text, because a user's team
 * memberships are rendered in the last column - so once a team is named after a user, the row
 * contains that name twice.
 */
function userRow(name: string): HTMLTableRowElement {
  const row = bodyRows(usersTable()).find(
    (candidate) => candidate.cells[2]!.textContent === name
  );
  if (row == undefined) {
    throw new Error(`no user row named ${name} - got ${shownUserNames()}`);
  }
  return row;
}

function selectUser(name: string) {
  fireEvent.click(within(userRow(name)).getByRole("checkbox"));
}

function teamNamed(teams: Teams, name: string) {
  const team = teams.get(name);
  if (team == undefined) {
    throw new Error(`no team named ${name} - got ${[...teams.keys()]}`);
  }
  return team;
}

describe("UsersAndTeams panel", () => {
  beforeEach(() => {
    appRoot = document.createElement("div");
    document.body.appendChild(appRoot);
    ReactModal.setAppElement(appRoot);
    // DelayedInput logs on every render of its confirm button - noise, not a failure.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    appRoot.remove();
    vi.restoreAllMocks();
  });

  it("dispatches nothing until the panel is saved", () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Alice Adams");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("creates a team from the selected users, named after a single selection", () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Alice Adams");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    saveAndClose();

    const { teams } = savedPayload(dispatch);
    expect([...teams.keys()]).toEqual(["Alice Adams"]);
    expect(teamNamed(teams, "Alice Adams").users).toEqual(new Set([0]));
  });

  it("adds the currently selected users to an existing team", () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Alice Adams");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    // Creating a team clears the selection, so this is a fresh one.
    selectUser("Bob Brown");
    fireEvent.click(
      within(teamsTable()).getByRole("button", { name: "add users" })
    );
    saveAndClose();

    expect(
      teamNamed(savedPayload(dispatch).teams, "Alice Adams").users
    ).toEqual(new Set([0, 1]));
  });

  it("removes the currently selected users from an existing team", () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Alice Adams");
    selectUser("Bob Brown");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    selectUser("Bob Brown");
    fireEvent.click(
      within(teamsTable()).getByRole("button", { name: "remove users" })
    );
    saveAndClose();

    // Two users were selected, so the team took the generated name rather than a user's.
    expect(teamNamed(savedPayload(dispatch).teams, "team 1").users).toEqual(
      new Set([0])
    );
  });

  it("creates an alias covering the selected users", async () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Alice Adams");
    selectUser("Bob Brown");
    fireEvent.click(screen.getByRole("button", { name: "Create alias" }));

    // The alias modal is a sibling portal, so it is scoped by its own content. Its name and
    // email labels both point at the name input (`htmlFor={aliasNameId}` twice), so they cannot
    // be reached by label text - the two text boxes are taken in order instead.
    const aliasModal = screen
      .getByText("Alias Name:")
      .closest(".ModalContent") as HTMLElement;
    const [nameInput, emailInput] = within(aliasModal).getAllByRole("textbox");
    // react-modal calls `onAfterOpen` from a `requestAnimationFrame`, so the modal's state is
    // seeded a frame after it renders. Waiting for the prefill - the most recent selected user's
    // details - is what proves that has happened before anything is typed over it.
    await waitFor(() =>
      expect(nameInput).toHaveValue(
        "Bob Brown" // the later of the two commit days
      )
    );
    fireEvent.change(nameInput!, { target: { value: "A. B. Person" } });
    fireEvent.change(emailInput!, { target: { value: "ab@example.com" } });
    fireEvent.click(
      within(aliasModal).getByRole("button", { name: "save and close" })
    );

    saveAndClose();

    const { aliases, aliasData } = savedPayload(dispatch);
    // Alias ids continue past the real users, so the first alias is id 3.
    expect(aliases).toEqual(
      new Map([
        [0, 3],
        [1, 3],
      ])
    );
    expect(aliasData).toEqual(
      new Map([[3, { id: 3, name: "A. B. Person", email: "ab@example.com" }]])
    );
  });

  it("ignores the selected users, and drops them from their teams", () => {
    const { dispatch } = renderPanel();
    openPanel();
    selectUser("Carol Clark");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    selectUser("Carol Clark");
    fireEvent.click(screen.getByRole("button", { name: /^Ignore user\(s\)/ }));

    // Ignored users leave the user list and appear in their own table.
    expect(shownUserNames()).toEqual(["Bob Brown", "Alice Adams"]);
    expect(
      within(ignoredUsersTable()).getByRole("cell", { name: "Carol Clark" })
    ).toBeInTheDocument();

    saveAndClose();

    const { ignoredUsers, teams } = savedPayload(dispatch);
    expect(ignoredUsers).toEqual(new Set([2]));
    expect(teamNamed(teams, "Carol Clark").users).toEqual(new Set());
  });

  it("filters the user list by name or email, ignoring case", () => {
    renderPanel();
    openPanel();
    const filter = screen.getByRole("textbox");

    // Capitalised deliberately: the filter used to lower-case only the values it compared
    // against, so any capital letter typed here matched nothing at all.
    fireEvent.change(filter, { target: { value: "Brown" } });
    expect(shownUserNames()).toEqual(["Bob Brown"]);

    fireEvent.change(filter, { target: { value: "carol@example" } });
    expect(shownUserNames()).toEqual(["Carol Clark"]);

    fireEvent.click(screen.getByRole("button", { name: "🗑" }));
    expect(shownUserNames()).toEqual([
      "Bob Brown",
      "Alice Adams",
      "Carol Clark",
    ]);
  });

  it("sorts the user list by a column, and reverses on a second click", () => {
    renderPanel();
    openPanel();
    // The default sort is by files, descending - Bob changed two files, the others one each.
    expect(shownUserNames()).toEqual([
      "Bob Brown",
      "Alice Adams",
      "Carol Clark",
    ]);

    const linesHeader = screen.getByRole("columnheader", {
      name: "Lines changed total",
    });
    fireEvent.click(linesHeader);
    expect(shownUserNames()).toEqual([
      "Carol Clark",
      "Bob Brown",
      "Alice Adams",
    ]);

    fireEvent.click(linesHeader);
    expect(shownUserNames()).toEqual([
      "Alice Adams",
      "Bob Brown",
      "Carol Clark",
    ]);
  });

  // `index.tsx` deliberately omits `React.StrictMode` for `Viz.tsx`'s sake (CLAUDE.md). This
  // panel is ordinary React and should not care - confirmed rather than assumed, so that a
  // later step can move code here without wondering.
  it("behaves the same under React.StrictMode", () => {
    const { dispatch } = renderPanel({ strict: true });
    openPanel();
    selectUser("Alice Adams");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create a new team with selected user(s)",
      })
    );
    selectUser("Bob Brown");
    fireEvent.click(
      within(teamsTable()).getByRole("button", { name: "add users" })
    );
    saveAndClose();

    expect(
      teamNamed(savedPayload(dispatch).teams, "Alice Adams").users
    ).toEqual(new Set([0, 1]));
  });
});
