// Pure colour helpers for the WebGL fill pipeline - no `gl` import, so this is testable under
// Vitest's jsdom environment (plan.md decision 6).

import * as d3 from "d3";

import { ColourKey, colourKeyToColours, PatternId } from "../state";

export type RGB = [r: number, g: number, b: number];

// Memoised CSS colour string -> [r,g,b] in 0-1. Built on d3-color (already a dependency, see
// Viz.tsx's own `d3.color()` use) rather than hand-rolled hex/rgb/named parsing, so every format
// it understands (3- and 6-digit hex, rgb(), rgba(), hsl(), named colours) works for free. Throws
// on unparseable input - a silently-black cell is exactly the failure mode CLAUDE.md avoids
// elsewhere (see `nodeCircleAncestors`).
const colourCache = new Map<string, RGB>();

export function parseCssColour(css: string): RGB {
  const cached = colourCache.get(css);
  if (cached) return cached;

  const parsed = d3.color(css);
  if (parsed == undefined) {
    throw new Error(`parseCssColour: could not parse colour "${css}"`);
  }
  const { r, g, b } = parsed.rgb();
  const rgb: RGB = [r / 255, g / 255, b / 255];
  colourCache.set(css, rgb);
  return rgb;
}

const PATTERN_URL = /^url\(#pattern(\d+)\)$/;

// Extracts the pattern id from a `TeamPatternVisualization` fill (`url(#patternN)`,
// state.ts's `PatternId`), or `null` for an ordinary CSS colour. geometry.ts uses this to route
// a vertex through the palette-texture stripe path (`a_patternIndex >= 0`, spec.md's "Team
// pattern visualisation") instead of `parseCssColour`, which can't parse a pattern URL.
export function parsePatternId(fill: string): PatternId | null {
  const match = PATTERN_URL.exec(fill);
  return match ? Number(match[1]) : null;
}

export interface PatternPalette {
  // N*3 texels * 3 channels, one RGB triple per pattern id in ascending id order - pattern ids
  // are contiguous from 0 (svgPatterns.ts's calculateFilePatterns assigns them via
  // `svgPatternIds.size`), so a pattern id is directly the texel-triple index, no lookup table
  // needed. Uint8 because this uploads straight to a `gl.RGB`/`UNSIGNED_BYTE` texture.
  rgb: Uint8Array;
  patternCount: number;
}

// Builds the N x 1 RGB palette texture data the stripe fragment shader samples (spec.md, "Team
// pattern visualisation"): 3 texels per pattern, one per `SVG_PARTITIONS` band. A colour key with
// fewer than 3 colours (`topTeamsPartitioned` can return fewer than `SVG_PARTITIONS` entries when
// a team doesn't clear the quota) pads with `neutralColour` - matching the old SVG-era
// `svgPatternDefs()`'s `?? neutralColour` fallback, so a partial split still renders sensibly.
// `patternCount` 0 (no team data) is valid: the caller uploads a 1-texel placeholder rather than
// a zero-width texture, and no vertex will ever have a non-negative `a_patternIndex` to sample it
// with, since `svgPatternLookup` is empty too in that case.
export function buildPatternPalette(
  svgPatternIds: ReadonlyMap<ColourKey, PatternId>,
  neutralColour: string
): PatternPalette {
  const patternCount = svgPatternIds.size;
  const rgb = new Uint8Array(patternCount * 3 * 3);
  for (const [colourKey, patternId] of svgPatternIds) {
    const colours = colourKeyToColours(colourKey);
    for (let band = 0; band < 3; band++) {
      const [r, g, b] = parseCssColour(colours[band] ?? neutralColour);
      const offset = (patternId * 3 + band) * 3;
      rgb[offset] = Math.round(r * 255);
      rgb[offset + 1] = Math.round(g * 255);
      rgb[offset + 2] = Math.round(b * 255);
    }
  }
  return { rgb, patternCount };
}
