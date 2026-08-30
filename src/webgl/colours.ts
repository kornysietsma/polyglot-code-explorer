// Pure colour helpers for the WebGL fill pipeline.

import * as d3 from "d3";

import { ColourKey, colourKeyToColours, PatternId } from "../state/colours";
import { SVG_PARTITIONS } from "../svgPatterns";

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
// a vertex through the palette-texture stripe path (`a_patternIndex >= 0`) instead of
// `parseCssColour`, which can't parse a pattern URL.
export function parsePatternId(fill: string): PatternId | null {
  const match = PATTERN_URL.exec(fill);
  return match ? Number(match[1]) : null;
}

export interface PatternPalette {
  // patternCount * SVG_PARTITIONS texels * 3 channels, one RGB triple per stripe band per pattern
  // id, in ascending id order - pattern ids are contiguous from 0 (svgPatterns.ts's
  // calculateFilePatterns assigns them via `svgPatternIds.size`), so a pattern id is directly the
  // texel-group index, no lookup table needed. Uint8 because this uploads straight to a
  // `gl.RGB`/`UNSIGNED_BYTE` texture.
  rgb: Uint8Array;
  patternCount: number;
}

// Builds the N x 1 RGB palette texture data the stripe fragment shader samples: one texel per
// `SVG_PARTITIONS` band per pattern. A colour key with fewer bands than that (`topTeamsPartitioned`
// can return fewer entries when a team doesn't clear the quota) pads with `neutralColour`, so a
// partial split still renders sensibly. `patternCount` 0 (no team data) is valid: GlRenderer
// uploads a 1-texel placeholder rather than a zero-width texture, and no vertex will ever have a
// non-negative `a_patternIndex` to sample it with, since `svgPatternLookup` is empty too then.
export function buildPatternPalette(
  svgPatternIds: ReadonlyMap<ColourKey, PatternId>,
  neutralColour: string
): PatternPalette {
  const patternCount = svgPatternIds.size;
  const rgb = new Uint8Array(patternCount * SVG_PARTITIONS * 3);
  for (const [colourKey, patternId] of svgPatternIds) {
    const colours = colourKeyToColours(colourKey);
    for (let band = 0; band < SVG_PARTITIONS; band++) {
      const [r, g, b] = parseCssColour(colours[band] ?? neutralColour);
      const offset = (patternId * SVG_PARTITIONS + band) * 3;
      rgb[offset] = Math.round(r * 255);
      rgb[offset + 1] = Math.round(g * 255);
      rgb[offset + 2] = Math.round(b * 255);
    }
  }
  return { rgb, patternCount };
}
