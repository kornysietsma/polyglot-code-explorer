import _ from "lodash";
import { describe, expect, it } from "vitest";

import { Config, themedColours } from "./state";
import { minimalState } from "./testFixtures";
import { buildNestingStyle, isNestingOnlyChange } from "./vizUpdatePaths";
import { OUTLINE_LEVEL_COUNT } from "./webgl/geometry";

// Deep-cloned so a mutation to the copy can't reach back into the original - `isNestingOnlyChange`
// compares the two, so sharing nested objects would make every test pass trivially.
function editedConfig(base: Config, edit: (config: Config) => void): Config {
  const next = _.cloneDeep(base);
  edit(next);
  return next;
}

describe("isNestingOnlyChange", () => {
  const base = minimalState().config;

  it("is false when nothing changed at all", () => {
    expect(isNestingOnlyChange(base, _.cloneDeep(base))).toBe(false);
  });

  it("is true for a nesting width edit", () => {
    const next = editedConfig(base, (config) => {
      config.nesting.nestedWidths[0] = 9;
    });
    expect(isNestingOnlyChange(base, next)).toBe(true);
  });

  it("is true for a nesting stroke colour edit", () => {
    const next = editedConfig(base, (config) => {
      themedColours(config).nestedStrokes[0] = "#123456";
    });
    expect(isNestingOnlyChange(base, next)).toBe(true);
  });

  it("is true for a default stroke edit", () => {
    const next = editedConfig(base, (config) => {
      themedColours(config).defaultStroke = "#123456";
    });
    expect(isNestingOnlyChange(base, next)).toBe(true);
  });

  it("is false for a visualisation switch, which moves fill colours", () => {
    const next = editedConfig(base, (config) => {
      config.visualization = "loc";
    });
    expect(isNestingOnlyChange(base, next)).toBe(false);
  });

  it("is false for a date range change", () => {
    const next = editedConfig(base, (config) => {
      config.filters.dateRange.earliest += 1000;
    });
    expect(isNestingOnlyChange(base, next)).toBe(false);
  });

  // The case the whole predicate exists to get right: a theme switch moves nestedStrokes and
  // defaultStroke, so the "did nesting change?" half is true - but it moves every other colour
  // too, so it must still take the full setColours() path or the fills keep the old theme.
  it("is false for a theme switch, even though it moves the nesting strokes", () => {
    const next = editedConfig(base, (config) => {
      config.colours.currentTheme =
        base.colours.currentTheme === "dark" ? "light" : "dark";
    });
    expect(
      _.isEqual(
        themedColours(base).nestedStrokes,
        themedColours(next).nestedStrokes
      )
    ).toBe(false);
    expect(isNestingOnlyChange(base, next)).toBe(false);
  });

  // A nesting edit and something else in the same dispatch is not the cheap path. No action does
  // this today, but nothing stops one being added, and the failure would be a silently stale fill.
  it("is false when a nesting edit is combined with any other change", () => {
    const next = editedConfig(base, (config) => {
      config.nesting.defaultWidth = 5;
      config.visualization = "loc";
    });
    expect(isNestingOnlyChange(base, next)).toBe(false);
  });
});

describe("buildNestingStyle", () => {
  it("puts the default stroke and width last, one entry per outline level", () => {
    const state = minimalState();
    const { config } = state;
    const theme = themedColours(config);
    const style = buildNestingStyle(state);

    expect(style.widths.length).toBe(OUTLINE_LEVEL_COUNT);
    expect(style.strokeColours.length).toBe(OUTLINE_LEVEL_COUNT);
    expect([...style.widths]).toEqual([
      ...config.nesting.nestedWidths,
      config.nesting.defaultWidth,
    ]);
    expect([...style.strokeColours]).toEqual([
      ...theme.nestedStrokes,
      theme.defaultStroke,
    ]);
  });
});
