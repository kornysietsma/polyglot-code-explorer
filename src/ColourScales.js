import * as d3 from "d3";
import _ from "lodash";

export function numberOfChangersScale(config, metadata) {
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
  return (config, metadata) => {
    const { good, bad, ugly } = _.get(config, configLocation);
    return goodBadUglyScale(config, good, bad, ugly);
  };
}

export function languageScaleBuilder(config, metadata) {
  const { languageMap } = metadata.languages;
  return (d) => {
    return languageMap[d].colour;
  };
}

export function depthScaleBuilder(config, metadata) {
  const { maxDepth } = metadata.stats;

  return d3
    .scaleSequential(d3.interpolatePlasma)
    .domain([0, maxDepth])
    .clamp(true);
}

export function earlyLateScaleBuilder(config, metadata) {
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
