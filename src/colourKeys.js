import * as d3 from "d3";
import _ from "lodash";
import { humanizeDate } from "./datetimes";

export function goodBadUglyColourKeyData(configLocation) {
  return (vis, state, metadata) => {
    const { good, bad, ugly, precision } = _.get(state.config, configLocation);
    const scale = vis.colourScaleBuilder(state, metadata);

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

export function languageColourKeyData(vis, state, metadata) {
  const { languageKey, otherColour } = metadata.languages;
  return [
    ...languageKey.map((k) => [k.language, k.colour]),
    ["Other languages", otherColour],
  ];
}

export function depthKeyData(vis, state, metadata) {
  const { maxDepth } = metadata.stats;
  const scale = vis.colourScaleBuilder(state, metadata);
  const key = [];
  for (let ix = 1; ix <= maxDepth; ix += 1) {
    key.push([ix, scale(ix)]);
  }
  return key;
}

export function creationKeyData(vis, state, metadata) {
  const scale = vis.colourScaleBuilder(state, metadata);
  const { config } = state;
  const {
    dateRange: { earliest, latest },
  } = config;
  const dateRange = latest - earliest;

  const keyText = (value) => `${humanizeDate(value)}`;

  const key = [["Outside date range", config.colours.neutralColour]];
  for (let ix = 0; ix <= 20; ix += 1) {
    const age = earliest + Math.floor((ix * dateRange) / 20);
    key.push([keyText(age), scale(age)]);
  }
  return key;
}

export function numberOfChangersKeyData(vis, state, metadata) {
  const scale = vis.colourScaleBuilder(state, metadata);
  const { config } = state;
  const { numberOfChangers } = config;
  const key = [
    ["None", numberOfChangers.noChangersColour],
    ["One", numberOfChangers.oneChangerColour],
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

function shortName(user) {
  if (user.name) return user.name;
  return user.email;
}

function shortUserNames(ownerStr, users) {
  if (ownerStr === "") return "(none)";
  const userIds = ownerStr.split("_").map((s) => parseInt(s, 10));
  if (userIds.length > 5) {
    return `${userIds.length} different users`;
  }
  return userIds
    .map((userId) => {
      return shortName(users[userId].user);
    })
    .join(", ");
}

export function ownersColourKeyData(vis, state, metadata) {
  const { ownerData } = state.calculated;
  const { users } = metadata;
  const scale = vis.colourScaleBuilder(state, metadata);

  // for now, just give owners - later it'd be nice to have counts as well?
  const key = [["No commits", scale("")]];
  const { ownerColours } = state.config.colours.light; // just using counts so theme isn't important
  const { oneOwnerColours, moreOwnerColours } = ownerColours;
  const maxDifferentOwners = oneOwnerColours.length + moreOwnerColours.length;
  ownerData.slice(0, maxDifferentOwners).forEach(([ownerStr, { value }]) => {
    const label = `${shortUserNames(ownerStr, users)} (${value})`;
    key.push([label, scale(ownerStr)]);
  });

  key.push(["other", scale("xxxx")]);

  return key;
}
