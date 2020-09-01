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

// TODO: this could be scrapped as it works for every case!
export default function standardFillBuilder(config, scale, dataFn, parentFn) {
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
