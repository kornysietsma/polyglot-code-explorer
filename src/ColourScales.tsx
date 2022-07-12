import * as d3 from "d3";
import _ from "lodash";

export function numberOfChangersScale(state, metadata) {
  const { config } = state;

  const { numberOfChangers: conf } = config;
  return d3
    .scaleLinear()
    .domain([
      0,
      1,
      conf.fewChangersMin,
      conf.fewChangersMax,
      conf.manyChangersMax,
    ])
    .range([
      conf.noChangersColour,
      conf.oneChangerColour,
      conf.fewChangersMinColour,
      conf.fewChangersMaxColour,
      conf.manyChangersColour,
    ])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

export function goodBadUglyScale(config, good, bad, ugly) {
  const { goodColour, badColour, uglyColour } = config.colours[
    config.colours.currentTheme
  ];

  return d3
    .scaleLinear()
    .domain([good, bad, ugly])
    .range([goodColour, badColour, uglyColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

export function goodBadUglyScaleBuilder(configLocation) {
  return (state, metadata) => {
    const { config } = state;

    const { good, bad, ugly } = _.get(config, configLocation);
    return goodBadUglyScale(config, good, bad, ugly);
  };
}

export function languageScaleBuilder(state, metadata) {

  const { languageMap } = metadata.languages;
  return (d) => {
    return languageMap[d].colour;
  };
}

export function depthScaleBuilder(state, metadata) {
  const { maxDepth } = metadata.stats;

  return d3
    .scaleSequential(d3.interpolatePlasma)
    .domain([0, maxDepth])
    .clamp(true);
}

export function earlyLateScaleBuilder(state, metadata) {
  const { config } = state;
  const { earlyColour, lateColour } = config.colours[
    config.colours.currentTheme
  ];
  const { earliest, latest } = config.dateRange;

  return d3
    .scaleLinear()
    .domain([earliest, latest])
    .range([earlyColour, lateColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

// duplicated from state to avoid circular dependency!
function themedColours(config) {
  return config.colours[config.colours.currentTheme];
}

export function ownersColourScaleBuilder(state, metadata) {
  const { config, calculated } = state;
  const { ownerData } = calculated;
  // ownerData is a map (actually an array of arrays)
  // containing the top owners
  // structure is
  // [ [ owner_string,
  //   { value, totalValue, fileCount }
  //  ]]
  // Colours should be:
  // No owner: use noOwnersColour, use "" as key
  // 1 owner: take values from oneOwner, if it runs out take from moreOwners
  // 2+ owners: take values from moreOwners
  // more than that: use a very light colour
  //
  // so the scale handles oneOwner.length + moreOwners.length values, plus "none" and "other"

  const { ownerColours } = themedColours(config);
  const {
    noOwnersColour,
    oneOwnerColours,
    moreOwnerColours,
    otherColour,
  } = ownerColours;

  const availColours1 = _.cloneDeep(oneOwnerColours);
  const availColours2 = _.cloneDeep(moreOwnerColours);

  const maxDifferentOwners = oneOwnerColours.length + moreOwnerColours.length;

  const domain = [""];
  const range = [noOwnersColour];
  ownerData.slice(0, maxDifferentOwners).forEach(([ownerStr]) => {
    const ownerCount = ownerStr.split("_").length;
    if (ownerCount === 0) throw new Error("saw no owners?");
    let nextColour;
    if (ownerCount === 1) {
      if (availColours1.length > 0) {
        nextColour = availColours1.shift();
      } else {
        nextColour = availColours2.shift();
      }
    } else {
      // more than 1 - default to colours2
      // eslint-disable-next-line no-lonely-if
      if (availColours2.length > 0) {
        nextColour = availColours2.shift();
      } else {
        nextColour = availColours1.shift();
      }
    }
    domain.push(ownerStr);
    range.push(nextColour);
  });
  return d3.scaleOrdinal(domain, range).unknown(otherColour);
}
