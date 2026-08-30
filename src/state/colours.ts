// The colour helpers every other state module reaches for. Deliberately their own module: they
// are what `postprocessState` and the reducer both need, and `initialiseGlobalState` calls
// `postprocessState`, so leaving them in `config.ts` would make config and derived state import
// each other's values. The one import below is a type, erased at build time, so nothing here
// depends on another module at runtime.

import { Config } from "./config";

export type PatternId = number;
/** ColourKey is needed for map IDs - it's created from a string[] of colours, tab separated */
export type ColourKey = string;
export function colourKeyToColours(key: ColourKey): string[] {
  return key.split("\t");
}
export function coloursToColourKey(colours: string[]): ColourKey {
  return colours.join("\t");
}

export function themedColours(config: Config) {
  return config.colours[config.colours.currentTheme];
}

export function themedErrorColour(config: Config) {
  return themedColours(config).errorColour;
}
