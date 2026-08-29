import { describe, expect, it } from "vitest";

import { ColourKey, coloursToColourKey, PatternId } from "../state";
import { buildPatternPalette, parseCssColour, parsePatternId } from "./colours";

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

describe("parsePatternId", () => {
  it("extracts the id from a pattern URL", () => {
    expect(parsePatternId("url(#pattern0)")).toBe(0);
    expect(parsePatternId("url(#pattern42)")).toBe(42);
  });

  it("returns null for an ordinary CSS colour", () => {
    expect(parsePatternId("#ff0000")).toBeNull();
    expect(parsePatternId("rgb(1,2,3)")).toBeNull();
  });
});

describe("buildPatternPalette", () => {
  const solidRed = coloursToColourKey(["#ff0000", "#00ff00", "#0000ff"]);
  const solidGrey = coloursToColourKey(["#111111", "#111111", "#111111"]);
  // topTeamsPartitioned can return fewer than SVG_PARTITIONS entries (nodeData.ts) - a colour
  // key with only 2 colours is a real shape, not a hypothetical.
  const twoColours = coloursToColourKey(["#ff0000", "#00ff00"]);
  const svgPatternIds: ReadonlyMap<ColourKey, PatternId> = new Map([
    [solidRed, 0],
    [solidGrey, 1],
    [twoColours, 2],
  ]);

  function texel(rgb: Uint8Array, patternId: number, band: number): number[] {
    const offset = (patternId * 3 + band) * 3;
    return [rgb[offset]!, rgb[offset + 1]!, rgb[offset + 2]!];
  }

  it("packs 3 RGB texels per pattern, in patternId order", () => {
    const { rgb, patternCount } = buildPatternPalette(svgPatternIds, "#000000");
    expect(patternCount).toBe(3);
    expect(rgb.length).toBe(3 * 3 * 3);

    expect(texel(rgb, 0, 0)).toEqual([255, 0, 0]);
    expect(texel(rgb, 0, 1)).toEqual([0, 255, 0]);
    expect(texel(rgb, 0, 2)).toEqual([0, 0, 255]);

    expect(texel(rgb, 1, 0)).toEqual([17, 17, 17]);
    expect(texel(rgb, 1, 1)).toEqual([17, 17, 17]);
    expect(texel(rgb, 1, 2)).toEqual([17, 17, 17]);
  });

  it("pads a colour key with fewer than 3 colours using neutralColour", () => {
    const { rgb } = buildPatternPalette(svgPatternIds, "#123456");
    expect(texel(rgb, 2, 0)).toEqual([255, 0, 0]);
    expect(texel(rgb, 2, 1)).toEqual([0, 255, 0]);
    expect(texel(rgb, 2, 2)).toEqual([0x12, 0x34, 0x56]);
  });

  it("returns a 0-length palette for no patterns at all", () => {
    const { rgb, patternCount } = buildPatternPalette(new Map(), "#000000");
    expect(patternCount).toBe(0);
    expect(rgb.length).toBe(0);
  });
});
