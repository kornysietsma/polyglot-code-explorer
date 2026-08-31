import { scaleUtc } from "d3";
import { describe, expect, it } from "vitest";

import { unixToDate } from "../datetimes";
import { FeatureFlags } from "../polyglot_data.types";
import { TimescaleIntervalData } from "../preprocess";
import {
  addUtcDays,
  brushedDateRange,
  timescaleDomain,
  timescaleValueFn,
} from "./timescale";

const DAY = 24 * 60 * 60;

function features(git: boolean): FeatureFlags {
  return { git, coupling: false, git_details: false, file_stats: false };
}

function week(
  isoDay: string,
  { commits = 0, files = 0 } = {}
): TimescaleIntervalData {
  return {
    day: new Date(isoDay),
    files,
    commits,
    lines_added: 0,
    lines_deleted: 0,
  };
}

describe("addUtcDays", () => {
  it("adds absolute elapsed time, so it is exact in UTC", () => {
    expect(addUtcDays(new Date("2019-04-09T00:00:00Z"), 7).toISOString()).toBe(
      "2019-04-16T00:00:00.000Z"
    );
    expect(addUtcDays(new Date("2019-04-09T00:00:00Z"), -7).toISOString()).toBe(
      "2019-04-02T00:00:00.000Z"
    );
  });

  // The whole reason it isn't date-fns' addDays: BST starts on 2021-03-28, so a local-calendar
  // "add 7 days" over that boundary lands an hour off a day-aligned UTC timestamp.
  it("does not shift across a daylight-saving boundary", () => {
    expect(addUtcDays(new Date("2021-03-25T00:00:00Z"), 7).toISOString()).toBe(
      "2021-04-01T00:00:00.000Z"
    );
  });

  it("leaves the date it was given alone", () => {
    const original = new Date("2019-04-09T00:00:00Z");
    addUtcDays(original, 7);
    expect(original.toISOString()).toBe("2019-04-09T00:00:00.000Z");
  });
});

describe("timescaleValueFn", () => {
  const data = week("2019-04-09T00:00:00Z", { commits: 3, files: 5 });

  it("counts commits when the scan has git data", () => {
    expect(timescaleValueFn(features(true))(data)).toBe(3);
  });

  it("falls back to files modified when it does not", () => {
    expect(timescaleValueFn(features(false))(data)).toBe(5);
  });
});

describe("timescaleDomain", () => {
  it("spans the data, padded a week each side", () => {
    expect(
      timescaleDomain([
        week("2019-04-09T00:00:00Z"),
        week("2019-05-07T00:00:00Z"),
        week("2019-04-16T00:00:00Z"),
      ]).map((d) => d.toISOString())
    ).toEqual(["2019-04-02T00:00:00.000Z", "2019-05-14T00:00:00.000Z"]);
  });

  it("still spans a fortnight when there is only one week of data", () => {
    expect(
      timescaleDomain([week("2019-04-09T00:00:00Z")]).map((d) =>
        d.toISOString()
      )
    ).toEqual(["2019-04-02T00:00:00.000Z", "2019-04-16T00:00:00.000Z"]);
  });

  it("throws rather than drawing an axis with no domain", () => {
    expect(() => timescaleDomain([])).toThrow(
      "No date range in timescale data"
    );
  });
});

describe("brushedDateRange", () => {
  // 100 unix days across 100 pixels, so a pixel is a day and the arithmetic is checkable by eye.
  const start = 0;
  const end = 100 * DAY;
  const xScale = scaleUtc()
    .domain([unixToDate(start), unixToDate(end)])
    .range([0, 100]);

  it("converts the brushed pixels back to unix seconds", () => {
    expect(brushedDateRange([10, 20], xScale, start, end)).toEqual([
      10 * DAY,
      20 * DAY,
    ]);
  });

  // drawTimescale calls brush.move on every redraw, which fires "end" with exactly the range
  // already in state. Dispatching that would set the state it came from, and loop.
  it("means nothing when the brush lands back on the range already in state", () => {
    expect(brushedDateRange([0, 100], xScale, start, end)).toBeUndefined();
  });

  it("is a real change when either end moves", () => {
    expect(brushedDateRange([0, 90], xScale, start, end)).toEqual([
      start,
      90 * DAY,
    ]);
    expect(brushedDateRange([10, 100], xScale, start, end)).toEqual([
      10 * DAY,
      end,
    ]);
  });
});
