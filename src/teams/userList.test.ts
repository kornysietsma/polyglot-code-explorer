import { describe, expect, it } from "vitest";

import { minimalPageState, pageStateUser } from "../testFixtures";
import {
  nextSort,
  sortHeaderStyle,
  sortUsers,
  userIsVisible,
  visibleUsers,
} from "./userList";

// Four users whose columns disagree with each other, so a sort assertion cannot pass by
// coincidence - and whose names sort differently from their ids.
const users = [
  pageStateUser(0, {
    name: "Zoe",
    email: "c@example.com",
    files: 1,
    lines: 30,
  }),
  pageStateUser(1, {
    name: "adam",
    email: "a@example.com",
    files: 3,
    lines: 10,
    commits: 5,
    days: new Set([1, 2]),
  }),
  pageStateUser(2, { name: "Mo", email: "b@example.com", files: 2, lines: 20 }),
];

const names = (sorted: { name?: string }[]) => sorted.map((u) => u.name);

describe("sorting the user list", () => {
  it("sorts by name case- and punctuation-insensitively", () => {
    expect(names(sortUsers(users, { key: "name", ascending: true }))).toEqual([
      "adam",
      "Mo",
      "Zoe",
    ]);
    expect(names(sortUsers(users, { key: "name", ascending: false }))).toEqual([
      "Zoe",
      "Mo",
      "adam",
    ]);
  });

  it("sorts by email", () => {
    expect(names(sortUsers(users, { key: "email", ascending: true }))).toEqual([
      "adam",
      "Mo",
      "Zoe",
    ]);
  });

  // "ascending" on a numeric column puts the *largest* first - the panel's own convention, since
  // what a reader wants from these columns is the busiest user at the top.
  it("puts the biggest number first on a numeric column when ascending", () => {
    expect(names(sortUsers(users, { key: "lines", ascending: true }))).toEqual([
      "Zoe",
      "Mo",
      "adam",
    ]);
    expect(names(sortUsers(users, { key: "lines", ascending: false }))).toEqual(
      ["adam", "Mo", "Zoe"]
    );
  });

  it("sorts by the number of days rather than the set itself", () => {
    expect(names(sortUsers(users, { key: "days", ascending: true }))).toEqual([
      "adam",
      "Zoe",
      "Mo",
    ]);
  });

  it("leaves the input alone", () => {
    sortUsers(users, { key: "name", ascending: true });
    expect(names(users)).toEqual(["Zoe", "adam", "Mo"]);
  });

  it("refuses a column it does not know how to sort", () => {
    expect(() => sortUsers(users, { key: "colour", ascending: true })).toThrow(
      "Unknown sort key colour"
    );
  });
});

describe("sort controls", () => {
  it("sorts by a newly clicked column, ascending", () => {
    expect(nextSort({ key: "files", ascending: false }, "name")).toEqual({
      key: "name",
      ascending: true,
    });
  });

  it("reverses when the column already sorted by is clicked again", () => {
    expect(nextSort({ key: "name", ascending: true }, "name")).toEqual({
      key: "name",
      ascending: false,
    });
  });

  it("marks only the sorted column, with its direction", () => {
    const sort = { key: "name", ascending: true };
    expect(sortHeaderStyle(sort, "name")).toBe("sortable sortAscending");
    expect(sortHeaderStyle({ ...sort, ascending: false }, "name")).toBe(
      "sortable sortDescending"
    );
    expect(sortHeaderStyle(sort, "email")).toBe("sortable unsorted");
  });
});

describe("which users the list shows", () => {
  const [zoe, adam, mo] = users as [
    (typeof users)[0],
    (typeof users)[0],
    (typeof users)[0],
  ];

  it("hides aliased and ignored users", () => {
    const pageState = minimalPageState({
      aliases: new Map([[0, 9]]),
      ignoredUsers: new Set([2]),
    });

    expect(userIsVisible(pageState, zoe)).toBe(false);
    expect(userIsVisible(pageState, mo)).toBe(false);
    expect(userIsVisible(pageState, adam)).toBe(true);
  });

  it("always shows a selected user, whatever the filter says", () => {
    const pageState = minimalPageState({
      checkedUsers: new Set([0]),
      userFilter: "nothing matches this",
      showCheckedUsers: false,
    });

    expect(userIsVisible(pageState, zoe)).toBe(true);
    expect(userIsVisible(pageState, mo)).toBe(false);
  });

  it("shows only selected users when asked to", () => {
    const pageState = minimalPageState({
      checkedUsers: new Set([0]),
      showCheckedUsers: true,
    });

    expect(userIsVisible(pageState, zoe)).toBe(true);
    expect(userIsVisible(pageState, mo)).toBe(false);
  });

  it("matches the filter against name and email", () => {
    expect(userIsVisible(minimalPageState({ userFilter: "zo" }), zoe)).toBe(
      true
    );
    expect(
      userIsVisible(minimalPageState({ userFilter: "c@example" }), zoe)
    ).toBe(true);
    expect(userIsVisible(minimalPageState({ userFilter: "zo" }), mo)).toBe(
      false
    );
  });

  // The filter used to lower-case only the values it compared against, so any capital letter
  // typed into the filter box matched nothing at all.
  it("ignores case in the filter itself, not just in the values", () => {
    expect(userIsVisible(minimalPageState({ userFilter: "Zo" }), zoe)).toBe(
      true
    );
    expect(userIsVisible(minimalPageState({ userFilter: "ADAM" }), adam)).toBe(
      true
    );
    expect(
      userIsVisible(minimalPageState({ userFilter: "C@Example" }), zoe)
    ).toBe(true);
  });

  it("sorts and then filters, as the table renders it", () => {
    const pageState = minimalPageState({
      usersAndAliases: users,
      usersSort: { key: "name", ascending: true },
      ignoredUsers: new Set([2]),
    });

    expect(names(visibleUsers(pageState))).toEqual(["adam", "Zoe"]);
  });
});
