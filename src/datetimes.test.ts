import { afterEach, describe, expect, it, vi } from "vitest";

import { humanizeDate, humanizeDays } from "./datetimes";

describe("humanizeDate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The scanner emits day-aligned UTC timestamps, so a commit must render as the same day
  // wherever the person reading the visualisation is. This is what failed before: date-fns's
  // local-time `format` rendered this timestamp as 08-Apr-2019 in `America/New_York`, a day
  // early, because the UI never shows a timezone to explain itself.
  it.each(["Europe/London", "America/New_York", "Australia/Sydney"])(
    "renders a UTC timestamp as its UTC day in %s",
    (timeZone) => {
      vi.stubEnv("TZ", timeZone);

      // Tuesday 2019-04-09, 00:00 UTC — midnight, so it is the timestamp most exposed to being
      // dragged into the neighbouring day by a timezone offset.
      expect(humanizeDate(1554768000)).toBe("09-Apr-2019");
    }
  );

  // en-GB abbreviates September as "Sept", so the formatting locale is not incidental.
  it.each([
    [Date.UTC(2019, 0, 1) / 1000, "01-Jan-2019"],
    [Date.UTC(2019, 8, 30) / 1000, "30-Sep-2019"],
    [Date.UTC(2019, 11, 31) / 1000, "31-Dec-2019"],
    [Date.UTC(2024, 1, 29) / 1000, "29-Feb-2024"],
  ])("renders %d as %s", (unixDate, expected) => {
    expect(humanizeDate(unixDate)).toBe(expected);
  });
});

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
