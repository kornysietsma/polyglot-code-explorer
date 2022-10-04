import * as d3 from "d3";

import { NO_TEAM_SYMBOL } from "./nodeData";
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

interface DisplayScale<Input, Output, Unknown> {
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
  /* 
    for crosshatching, we actually need to have element IDs for each pattern.
    The fill function, which is what the scale returns, is something like:
    "url(#diagonalHatch)"
    So I'll need to generate IDs for all used team combinations.
    */
  return (teamName: string) => {
    if (teamName == NO_TEAM_SYMBOL) {
      return themedColours(state.config).teams.noTeamColour;
    }
    const teamData = state.config.teamsAndAliases.teams.get(teamName);
    return teamData?.colour;
  };
}

export function singleTeamScale(state: State) {
  const { fileMaxima } = state.calculated;
  const { showLevelAsLightness, lightnessCap } = state.config.teamVisualisation;
  const { selectedTeamColour, otherUsersColour } = themedColours(
    state.config
  ).teams;
  const { neutralColour } = themedColours(state.config);

  const interpolator = d3.interpolateLab(selectedTeamColour, otherUsersColour);
  const max = fileMaxima[state.config.fileChangeMetric];
  return ([ownTotal, otherTotal]: [number, number]) => {
    const total = ownTotal + otherTotal;
    if (total <= 0) {
      return neutralColour;
    }
    const ownProportion = ownTotal / (ownTotal + otherTotal);

    const colour = interpolator(ownProportion);
    if (showLevelAsLightness) {
      const limit = lightnessCap < 1 ? max * lightnessCap : max;
      const hsl = d3.hsl(colour);
      hsl.l = Math.min((total / limit) * 0.5, 0.5);
      return hsl.formatHex();
    }
    return colour;
  };
}
