// The palettes the panel's auto-colour button can assign to teams. A leaf: data only, so that
// both the scheme dropdown and `pageStateEdits.recolourTeams` can read it without either
// depending on the other.

import * as d3 from "d3";

// Generated with http://vrl.cs.brown.edu/color
const bigColourRange: readonly string[] = [
  "#a1def0",
  "#335862",
  "#8dfa9d",
  "#2d7a2c",
  "#e6faa2",
  "#a93713",
  "#47faf4",
  "#7a2f9b",
  "#f7c5f1",
  "#5e497a",
  "#b97bbd",
  "#ec4dd8",
  "#11a0aa",
  "#7191ce",
  "#b9f617",
  "#ec102f",
  "#a0b460",
  "#a20655",
  "#efaa79",
  "#76480d",
];

export const colourSchemes: [string, readonly string[]][] = [
  ["d3 schemeCategory10", d3.schemeCategory10],
  ["d3 schemeTableau10", d3.schemeTableau10],
  ["d3 schemeSet1", d3.schemeSet1],
  ["d3 schemeSet2", d3.schemeSet2],
  ["d3 schemeSet3", d3.schemeSet3],
  ["d3 schemeAccent", d3.schemeAccent],
  ["d3 schemeDark2", d3.schemeDark2],
  ["d3 schemePaired", d3.schemePaired],
  ["d3 schemePastel1", d3.schemePastel1],
  ["d3 schemePastel2", d3.schemePastel2],
  ["Korny custom scheme", bigColourRange],
];

/** The scheme a page state's `colourScheme` index names. Throws rather than defaulting. */
export function colourSchemeAt(index: number): readonly string[] {
  const scheme = colourSchemes[index];
  if (scheme == undefined) {
    throw new Error("Logic error - impossible colour scheme");
  }
  return scheme[1];
}
