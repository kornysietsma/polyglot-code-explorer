import * as d3 from "d3";
import _ from "lodash";

import { humanizeDate } from "./datetimes";
import { GitUser } from "./polyglot_data.types";
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
  const {
    dateRange: { earliest, latest },
  } = config;
  const dateRange = latest - earliest;

  const keyText = (value: number) => `${humanizeDate(value)}`;

  const key: [string, string][] = [
    ["Outside date range", themedColours(config).neutralColour],
  ];
  for (let ix = 0; ix <= 20; ix += 1) {
    const age = earliest + Math.floor((ix * dateRange) / 20);
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

function shortName(user: GitUser) {
  return user.user.name ?? user.user.email ?? "invalid_user";
}

function shortUserNames(ownerStr: string, users: GitUser[] | undefined) {
  if (ownerStr === "") return "(none)";
  const userIds = ownerStr.split("_").map((s) => parseInt(s, 10));
  if (userIds.length > 5) {
    return `${userIds.length} different users`;
  }
  return userIds
    .map((userId) => {
      return users ? shortName(users[userId]) : `{userId}`;
    })
    .join(", ");
}

export function ownersColourKeyData(
  scale: (v: string) => string | undefined,
  state: State,
  metadata: VizMetadata
) {
  const { errorColour } = themedColours(state.config);
  const { ownerData } = state.calculated;
  const { users } = metadata;

  // for now, just give owners - later it'd be nice to have counts as well?
  const key: [string, string][] = [["No commits", scale("") ?? errorColour]];
  const { ownerColours } = state.config.colours.light; // just using counts so theme isn't important
  const { oneOwnerColours, moreOwnerColours, otherColour } = ownerColours;
  const maxDifferentOwners = oneOwnerColours.length + moreOwnerColours.length;
  ownerData.slice(0, maxDifferentOwners).forEach(([ownerStr]) => {
    const label = shortUserNames(ownerStr, users);
    key.push([label, scale(ownerStr) ?? errorColour]);
  });

  key.push(["other", otherColour]);

  return key;
}
