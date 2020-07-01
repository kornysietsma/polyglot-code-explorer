/* eslint-disable no-param-reassign */
import _ from "lodash";
import * as d3 from "d3";
import moment from "moment";
import { nodeGitData, nodeLinesOfCode, nodeLocData } from "./nodeData";

function addLanguagesFromNode(counts, node) {
  const loc = nodeLocData(node);
  if (loc) {
    const { language, code } = loc;
    if (!counts[language]) {
      counts[language] = { count: 0, loc: 0 };
    }
    counts[language].count += 1;
    counts[language].loc += code;
  }
  if (node.children !== undefined) {
    for (const child of node.children) {
      addLanguagesFromNode(counts, child);
    }
  }
}

/* eslint-enable no-param-reassign */
export function countLanguagesIn(data) {
  const counts = {};
  addLanguagesFromNode(counts, data);
  const countsPairs = [...Object.keys(counts)].map(k => [k, counts[k]]);
  const sortedMap = [...countsPairs].sort(
    ([l1, k1], [l2, k2]) => k2.loc - k1.loc
  );
  const colours = d3.schemeTableau10;
  const otherColour = "#303030";
  const languageMap = {};
  const languageKey = [];
  sortedMap.forEach(([key, val], index) => {
    const colour = index < colours.length ? colours[index] : otherColour;
    languageMap[key] = { ...val, colour };
    if (index < colours.length) {
      languageKey.push({ ...val, language: key, colour });
    }
  });
  return { languageKey, languageMap, otherColour };
}

function gatherNodeStats(node, statsSoFar, depth) {
  let stats = _.cloneDeep(statsSoFar);
  if (stats.maxDepth < depth) {
    stats.maxDepth = depth;
  }
  const loc = nodeLinesOfCode(node);
  if (loc && loc > stats.maxLoc) {
    stats.maxLoc = loc;
  }
  const gitData = nodeGitData(node);
  if (gitData && gitData.details && gitData.details.length > 0) {
    const days = gitData.details.map(d => d.commit_day);
    if (gitData.lastUpdate) {
      days.push(gitData.lastUpdate);
    }
    if (gitData.creationDate) {
      days.push(gitData.creationDate);
    }
    days.sort();
    const earliest = days[0];
    const latest = days[days.length - 1];
    if (stats.earliestCommit === undefined || earliest < stats.earliestCommit) {
      stats.earliestCommit = earliest;
    }
    if (stats.latestCommit === undefined || latest > stats.latestCommit) {
      stats.latestCommit = latest;
    }
  }
  if (node.children !== undefined) {
    stats = node.children.reduce((memo, child) => {
      return gatherNodeStats(child, memo, depth + 1);
    }, stats);
  }
  return stats;
}

export function gatherGlobalStats(data) {
  const statsSoFar = {
    earliestCommit: undefined,
    latestCommit: undefined,
    maxDepth: 0,
    maxLoc: 0,
    churn: {
      maxLines: 0,
      maxCommits: 0,
      maxDays: 0
    }
  };
  return gatherNodeStats(data, statsSoFar, 0);
}

// yes, I'm modifying a parameter, it's hard to avoid in JavaScript with big data structures
// timeUnit is 'week' or similar, passed to https://momentjs.com/docs/#/manipulating/start-of/
function addTimescaleData(timescaleData, node, timeUnit) {
  const gitData = nodeGitData(node);
  if (gitData && gitData.details && gitData.details.length > 0) {
    gitData.details.forEach(data => {
      const startDate = moment
        .unix(data.commit_day)
        .startOf(timeUnit)
        .unix();
      let dateData = timescaleData.get(startDate);
      if (!dateData)
        dateData = {
          files: 0,
          commits: 0,
          lines_added: 0,
          lines_deleted: 0
        };
      dateData.files += 1;
      dateData.commits += data.commits;
      dateData.lines_added += data.lines_added;
      dateData.lines_deleted += data.lines_deleted;
      timescaleData.set(startDate, dateData);
    });
  }
  if (node.children !== undefined) {
    node.children.forEach(child => {
      addTimescaleData(timescaleData, child, timeUnit);
    });
  }
}

export function gatherTimescaleData(data, timeUnit) {
  const timescaleData = new Map();
  addTimescaleData(timescaleData, data, timeUnit);
  // convert to a simple sorted array, as that's all we need really
  return [...timescaleData]
    .map(([day, dayData]) => {
      // convert to Javascript dates as d3 likes them - sigh.  I could do this on display?
      return { day: moment.unix(day).toDate(), ...dayData };
    })
    .sort((a, b) => a.day - b.day);
}

// yes, I'm modifying a parameter, it's hard to avoid in JavaScript with big data structures
function addNodesByPath(nodesByPath, node) {
  // eslint-disable-next-line no-param-reassign
  nodesByPath[node.path] = node;
  if (node.children !== undefined) {
    node.children.forEach(child => {
      addNodesByPath(nodesByPath, child);
    });
  }
}

export function gatherNodesByPath(data) {
  const nodesByPath = {};
  addNodesByPath(nodesByPath, data);
  return nodesByPath;
}
