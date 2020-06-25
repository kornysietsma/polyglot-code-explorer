import * as d3 from "d3";
import _ from "lodash";
import { humanizeDate } from "./datetimes";

export function goodBadUglyColourKeyData(configLocation) {
  return (vis, config, metadata, stats) => {
    const { good, bad, ugly, precision } = _.get(config, configLocation);
    const scale = vis.colourScaleBuilder(config, metadata, stats);

    const goodBad = d3.interpolateNumber(good, bad);
    const badUgly = d3.interpolateNumber(bad, ugly);
    const key = [];
    for (let ix = 0.0; ix < 1.0; ix += 0.1) {
      let metric = goodBad(ix);
      if (precision === 0) {
        metric = Math.round(metric);
      } else {
        metric = metric.toFixed(precision);
      }
      key.push([metric, scale(metric)]);
    }
    for (let ix = 0.1; ix <= 1.0; ix += 0.1) {
      let metric = badUgly(ix);
      if (precision === 0) {
        metric = Math.round(metric);
      } else {
        metric = metric.toFixed(precision);
      }
      key.push([metric, scale(metric)]);
    }
    return key;
  };
}

export function languageColourKeyData(vis, config, metadata, stats) {
  const { languageKey, otherColour } = metadata.languages;
  return [
    ...languageKey.map(k => [k.language, k.colour]),
    ["Other languages", otherColour]
  ];
}

export function depthKeyData(vis, config, metadata, stats) {
  const scale = vis.colourScaleBuilder(config, metadata, stats);
  const key = [];
  for (let ix = 1; ix <= stats.maxDepth; ix += 1) {
    key.push([ix, scale(ix)]);
  }
  return key;
}

export function creationKeyData(vis, config, metadata, stats) {
  const scale = vis.colourScaleBuilder(config, metadata, stats);
  const {
    dateRange: { earliest, latest }
  } = config;
  const dateRange = latest - earliest;

  const keyText = value => `${humanizeDate(value)}`;

  const key = [["Outside date range", config.colours.neutralColour]];
  for (let ix = 0; ix <= 20; ix += 1) {
    const age = earliest + Math.floor((ix * dateRange) / 20);
    key.push([keyText(age), scale(age)]);
  }
  return key;
}

export function numberOfChangersKeyData(vis, config, metadata, stats) {
  const scale = vis.colourScaleBuilder(config, metadata, stats);
  const { numberOfChangers } = config;
  const key = [
    ["None", numberOfChangers.noChangersColour],
    ["One", numberOfChangers.oneChangerColour]
  ];
  for (
    let i = numberOfChangers.fewChangersMin;
    i < numberOfChangers.fewChangersMax;
    i += 1
  ) {
    key.push([i, scale(i)]);
  }
  const scaleIncrement =
    (numberOfChangers.manyChangersMax - numberOfChangers.fewChangersMax) / 10;
  for (
    let n = numberOfChangers.fewChangersMax;
    n <= numberOfChangers.manyChangersMax;
    n += scaleIncrement
  ) {
    key.push([Math.round(n), scale(n)]);
  }
  return key;
}
