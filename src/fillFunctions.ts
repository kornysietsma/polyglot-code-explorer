/*
Fill Builders are called when config changes, they return a fill function
which only needs a node as a parameter, and return a colour.
 */

// overrides most other colours - mostly top-level circle packed background, and files that don't exist yet
// returns a colour, or undefined if there is no override
import { nodeCreationDate } from "./nodeData";

function overrideColourFunction(node, config) {
  const { nonexistentColour, circlePackBackground } = config.colours[
    config.colours.currentTheme
  ];
  const { latest } = config.dateRange;

  if (node.data.layout.algorithm === "circlePack") return circlePackBackground;
  const creationDate = nodeCreationDate(node);
  if (creationDate && creationDate > latest) return nonexistentColour;
  return undefined;
}

export function standardFillBuilder(state, scale, dataFn, parentFn) {
  const { config } = state;
  const { neutralColour } = config.colours[config.colours.currentTheme];
  const { earliest, latest } = config.dateRange;
  return (d) => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const value = d.children
      ? parentFn(d, earliest, latest)
      : dataFn(d, earliest, latest);

    return value === undefined ? neutralColour : scale(value);
  };
}

// special case - the ownership fill needs all the state, as it has to get threshold config.
// for now, parentFn is the same signature
// TODO: I should refactor to get rid of standardFillBuilder by making all dataFn functions take
// state as a paramater. But it's a lot of work
export function fullStateFillBuilder(state, scale, dataFn, parentFn) {
  const { config } = state;
  const { neutralColour } = config.colours[config.colours.currentTheme];
  const { earliest, latest } = config.dateRange;
  return (d) => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const value = d.children ? parentFn(d, earliest, latest) : dataFn(d, state);

    return value === undefined ? neutralColour : scale(value);
  };
}
