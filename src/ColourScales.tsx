import * as d3 from "d3";

import { Config, State } from "./state";

export function numberOfChangersScale(state: State) {
  const { config } = state;

  const { numberOfChangers: conf } = config;
  return d3
    .scaleLinear<string>()
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

export function goodBadUglyScale(
  config: Config,
  {
    good,
    bad,
    ugly,
  }: {
    good: number;
    bad: number;
    ugly: number;
  }
) {
  const { goodColour, badColour, uglyColour } = themedColours(config);

  return d3
    .scaleLinear<string>()
    .domain([good, bad, ugly])
    .range([goodColour, badColour, uglyColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

export interface DisplayScale<Input, Output, Unknown> {
  (value: Input): Output | Unknown;
}

export function earlyLateScaleBuilder(
  state: State
): DisplayScale<number, string, never> {
  const { config } = state;
  const { earlyColour, lateColour } = themedColours(config);
  const { earliest, latest } = config.filters.dateRange;

  return d3
    .scaleLinear<string>()
    .domain([earliest, latest])
    .range([earlyColour, lateColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
}

// duplicated from state to avoid circular dependency!
function themedColours(config: Config) {
  return config.colours[config.colours.currentTheme];
}

export function teamScale(state: State) {
  return (teamName: string) => {
    const teamData = state.config.userData.teams.get(teamName);
    return teamData?.colour;
  };
}
