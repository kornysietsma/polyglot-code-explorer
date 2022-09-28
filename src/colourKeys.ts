import * as d3 from "d3";

import { humanizeDate } from "./datetimes";
import { State, themedColours, themedErrorColour } from "./state";
import { VizMetadata } from "./viz.types";

export function goodBadUglyColourKeyData(
  scale: (v: number) => string | undefined,
  state: State,
  {
    good,
    bad,
    ugly,
    precision,
  }: { good: number; bad: number; ugly: number; precision: number }
): [string, string][] {
  const { errorColour } = themedColours(state.config);
  const goodBad = d3.interpolateNumber(good, bad);
  const badUgly = d3.interpolateNumber(bad, ugly);
  const key: [string, string][] = [];
  for (let ix = 0.0; ix < 1.0; ix += 0.1) {
    const metric = goodBad(ix);
    const metricText =
      precision === 0 ? `${Math.round(metric)}` : metric.toFixed(precision);

    key.push([metricText, scale(metric) ?? errorColour]);
  }
  for (let ix = 0.1; ix <= 1.0; ix += 0.1) {
    const metric = badUgly(ix);
    const metricText =
      precision === 0 ? `${Math.round(metric)}` : metric.toFixed(precision);
    key.push([metricText, scale(metric) ?? errorColour]);
  }
  return key;
}

export function depthKey(
  scale: (v: number) => string | undefined,
  state: State,
  metadata: VizMetadata
): [string, string][] {
  const { maxDepth } = metadata.stats;
  const key: [string, string][] = [];
  for (let ix = 1; ix <= maxDepth; ix += 1) {
    key.push([`${ix}`, scale(ix) ?? themedErrorColour(state.config)]);
  }
  return key;
}

export function creationKeyData(
  scale: (v: number) => string | undefined,
  state: State
): [string, string][] {
  const { config } = state;
  const { earliest, latest } = config.filters.dateRange;
  const dateRange = latest - earliest;
  const days = Math.ceil(dateRange / (24 * 60 * 60));
  const scaleSize = Math.min(20, days);

  const keyText = (value: number) => `${humanizeDate(value)}`;

  const key: [string, string][] = [
    ["Outside date range", themedColours(config).neutralColour],
  ];
  for (let ix = 0; ix <= scaleSize; ix += 1) {
    const age = earliest + Math.floor((ix * dateRange) / scaleSize);
    key.push([keyText(age), scale(age) ?? themedErrorColour(config)]);
  }
  return key;
}

export function numberOfChangersKeyData(
  scale: (v: number) => string | undefined,
  state: State
): [string, string][] {
  const { config } = state;
  const { numberOfChangers } = config;
  const errorColour = themedErrorColour(config);
  const key: [string, string][] = [
    ["None", numberOfChangers.noChangersColour],
    ["One", numberOfChangers.oneChangerColour],
  ];
  for (
    let i = numberOfChangers.fewChangersMin;
    i < numberOfChangers.fewChangersMax;
    i += 1
  ) {
    key.push([`${i}`, scale(i) ?? errorColour]);
  }
  const scaleIncrement =
    (numberOfChangers.manyChangersMax - numberOfChangers.fewChangersMax) / 10;
  for (
    let n = numberOfChangers.fewChangersMax;
    n <= numberOfChangers.manyChangersMax;
    n += scaleIncrement
  ) {
    key.push([`${Math.round(n)}`, scale(n) ?? errorColour]);
  }
  return key;
}
