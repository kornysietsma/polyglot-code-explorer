import { describe, expect, it } from "vitest";

import { ColourKey, coloursToColourKey, PatternId } from "../state";
import { parseCssColour, resolvePatternFallback } from "./colours";

// Actual default colours from state.ts (initialiseGlobalState), both themes - not exhaustive,
// but the values the app actually ships with, per plan.md.
const REAL_DEFAULT_COLOURS = [
  "#aaaaaa",
  "#777777",
  "#444444",
  "#222222",
  "#111111",
  "#fffa00",
  "#ff6300",
  "#0000ff",
  "#ff0000",
  "#ffff00",
  "#00ff00",
  "#808080",
  "#8080ff",
  "#f7f7f7",
  "#dddddd",
  "#eeeeee",
  "#00ffff",
];

describe("parseCssColour", () => {
  it("parses 3-digit hex", () => {
    expect(parseCssColour("#f00")).toEqual([1, 0, 0]);
  });

  it("parses 6-digit hex", () => {
    expect(parseCssColour("#ff0000")).toEqual([1, 0, 0]);
  });

  it("parses rgb()", () => {
    const [r, g, b] = parseCssColour("rgb(0, 128, 255)");
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(128 / 255);
    expect(b).toBeCloseTo(1);
  });

  it("parses rgba(), ignoring alpha", () => {
    const [r, g, b] = parseCssColour("rgba(0, 128, 255, 0.5)");
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(128 / 255);
    expect(b).toBeCloseTo(1);
  });

  it("parses named colours", () => {
    const [r, g, b] = parseCssColour("rebeccapurple");
    expect(r).toBeCloseTo(102 / 255);
    expect(g).toBeCloseTo(51 / 255);
    expect(b).toBeCloseTo(153 / 255);
  });

  it.each(REAL_DEFAULT_COLOURS)(
    "parses the themed default colour %s",
    (css) => {
      const [r, g, b] = parseCssColour(css);
      for (const channel of [r, g, b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  );

  it("memoises: the same input string returns the identical array instance", () => {
    const first = parseCssColour("#123456");
    const second = parseCssColour("#123456");
    expect(second).toBe(first);
  });

  it("throws on unparseable input", () => {
    expect(() => parseCssColour("not-a-colour")).toThrow(
      /could not parse colour/
    );
  });
});

describe("resolvePatternFallback", () => {
  const solidRed = coloursToColourKey(["#ff0000", "#00ff00", "#0000ff"]);
  const solidGrey = coloursToColourKey(["#111111", "#111111", "#111111"]);
  const svgPatternIds: ReadonlyMap<ColourKey, PatternId> = new Map([
    [solidRed, 0],
    [solidGrey, 3],
  ]);

  it("resolves a pattern URL to the first colour of its triple", () => {
    expect(resolvePatternFallback("url(#pattern0)", svgPatternIds)).toBe(
      "#ff0000"
    );
    expect(resolvePatternFallback("url(#pattern3)", svgPatternIds)).toBe(
      "#111111"
    );
  });

  it("passes non-pattern fills through untouched", () => {
    expect(resolvePatternFallback("#ff0000", svgPatternIds)).toBe("#ff0000");
    expect(resolvePatternFallback("rgb(1,2,3)", svgPatternIds)).toBe(
      "rgb(1,2,3)"
    );
  });

  it("throws on an unknown pattern id", () => {
    expect(() =>
      resolvePatternFallback("url(#pattern99)", svgPatternIds)
    ).toThrow(/unknown pattern id 99/);
  });
});
