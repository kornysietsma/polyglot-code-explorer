import * as d3 from "d3";

export function numberOfChangersScale(config) {
  const { numberOfChangers: conf } = config;

  return d3
    .scaleLinear()
    .domain([
      0,
      1,
      conf.fewChangersMin,
      conf.fewChangersMax,
      conf.manyChangersMax
    ])
    .range([
      conf.noChangersColour,
      conf.oneChangerColour,
      conf.fewChangersMinColour,
      conf.fewChangersMaxColour,
      conf.manyChangersColour
    ])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

export function lowHighScale(config, low, high) {
  const { lowColour, highColour } = config.colours;
  return d3
    .scaleLinear()
    .domain([low, high])
    .range([lowColour, highColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

export function goodBadUglyScale(config, good, bad, ugly) {
  const { goodColour, badColour, uglyColour } = config.colours;

  return d3
    .scaleLinear()
    .domain([good, bad, ugly])
    .range([goodColour, badColour, uglyColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}
