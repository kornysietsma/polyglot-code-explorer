import { describe, expect, it } from "vitest";

import { humanizeDays } from "./datetimes";

// `humanizeDays` renders a file's age in the node inspector, as the parenthesised half of
// "file last changed 132 days ago on 21-Apr-2025 (18 weeks, 6 days)". Years are 365 days and
// weeks are 7; months are deliberately absent because they aren't a fixed number of days.
describe("humanizeDays", () => {
  it.each([
    [0, "0 days"],
    [1, "1 day"],
    [2, "2 days"],
    [6, "6 days"],
    // a whole week is a week, not seven days - the boundary cases are the reason this is tested
    [7, "1 week"],
    [8, "1 week, 1 day"],
    [13, "1 week, 6 days"],
    [14, "2 weeks"],
    [364, "52 weeks"],
    // and a whole year is a year, not fifty-two weeks and a day
    [365, "1 year"],
    [366, "1 year, 1 day"],
    [372, "1 year, 1 week"],
    [373, "1 year, 1 week, 1 day"],
    [730, "2 years"],
  ])("renders %d days as %s", (days, expected) => {
    expect(humanizeDays(days)).toBe(expected);
  });
});
