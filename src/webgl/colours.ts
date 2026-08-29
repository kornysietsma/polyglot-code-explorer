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

// One reverse (PatternId -> first colour) map per distinct svgPatternIds Map, built once and
// cached by object identity rather than rescanning svgPatternIds on every call - this runs once
// per node during a colour-buffer rebuild (spec.md, "The three update paths"), so an O(n) scan
// per call would make it O(n*m) across a whole tree.
const reverseCache = new WeakMap<
  ReadonlyMap<ColourKey, PatternId>,
  ReadonlyMap<PatternId, string>
>();

function firstColourByPatternId(
  svgPatternIds: ReadonlyMap<ColourKey, PatternId>
): ReadonlyMap<PatternId, string> {
  const cached = reverseCache.get(svgPatternIds);
  if (cached) return cached;

  const reverse = new Map<PatternId, string>();
  for (const [colourKey, patternId] of svgPatternIds) {
    const first = colourKeyToColours(colourKey)[0];
    if (first == undefined) {
      throw new Error(
        `resolvePatternFallback: pattern ${patternId} has no colours`
      );
    }
    reverse.set(patternId, first);
  }
  reverseCache.set(svgPatternIds, reverse);
  return reverse;
}

// The flat-fill fallback for `TeamPatternVisualization`'s `url(#patternN)` fills, per spec.md's
// "Team pattern visualisation": resolves the pattern id against the precomputed
// ColourKey -> PatternId map (`state.calculated.svgPatterns.svgPatternIds`) and returns the
// first colour of the triple. Anything that isn't a pattern URL passes through untouched. Stands
// in until the real stripe shader lands in plan.md step 9.
export function resolvePatternFallback(
  fill: string,
  svgPatternIds: ReadonlyMap<ColourKey, PatternId>
): string {
  const match = PATTERN_URL.exec(fill);
  if (!match) return fill;

  const patternId = Number(match[1]);
  const colour = firstColourByPatternId(svgPatternIds).get(patternId);
  if (colour == undefined) {
    throw new Error(`resolvePatternFallback: unknown pattern id ${patternId}`);
  }
  return colour;
}
