/* eslint-disable no-param-reassign */
import * as d3 from "d3";
import _ from "lodash";
import moment, { unitOfTime } from "moment";

import { nodeGitData, nodeLinesOfCode, nodeLocData } from "./nodeData";
import {
  DirectoryNode,
  isDirectory,
  isFile,
  Tree,
  TreeNode,
} from "./polyglot_data.types";
import { LanguagesMetadata, TreeStats } from "./viz.types";

function linkParentRecursively(node: TreeNode, parent: DirectoryNode) {
  node.parent = parent;
  if (isDirectory(node)) {
    for (const child of node.children) {
      linkParentRecursively(child, node);
    }
  }
}

export function linkParents(data: Tree) {
  const rootNode = data.tree;
  if (!isDirectory(rootNode)) {
    throw new Error("Root of tree is not a directory!");
  }
  for (const child of rootNode.children) {
    linkParentRecursively(child, rootNode);
  }
}

function addLanguagesFromNode(
  counts: Map<string, { count: number; loc: number }>,
  node: TreeNode
) {
  const loc = isFile(node) && nodeLocData(node);
  if (loc) {
    const { language, code } = loc;
    const entry = counts.get(language) ?? { count: 0, loc: 0 };
    entry.count += 1;
    entry.loc += code;
    counts.set(language, entry);
  }
  if (isDirectory(node)) {
    for (const child of node.children) {
      addLanguagesFromNode(counts, child);
    }
  }
}

/* eslint-enable no-param-reassign */
export function countLanguagesIn(data: Tree): LanguagesMetadata {
  const counts: Map<string, { count: number; loc: number }> = new Map();
  addLanguagesFromNode(counts, data.tree);
  const sortedMap = [...counts].sort(([, k1], [, k2]) => k2.loc - k1.loc);
  const colours = d3.schemeTableau10;
  const otherColour = "#303030";
  const languageMap: Map<
    string,
    { count: number; loc: number; colour: string }
  > = new Map();
  const languageKey: Array<{
    count: number;
    loc: number;
    language: string;
    colour: string;
  }> = [];
  sortedMap.forEach(([key, val], index) => {
    const colour = index < colours.length ? colours[index] : otherColour;
    languageMap.set(key, { ...val, colour });
    if (index < colours.length) {
      languageKey.push({ ...val, language: key, colour });
    }
  });
  return { languageKey, languageMap, otherColour };
}

function gatherNodeStats(node: TreeNode, statsSoFar: TreeStats, depth: number) {
  let stats = _.cloneDeep(statsSoFar);
  if (stats.maxDepth < depth) {
    stats.maxDepth = depth;
  }
  const loc = isFile(node) ? nodeLinesOfCode(node) : undefined;
  if (loc && loc > stats.maxLoc) {
    stats.maxLoc = loc;
  }
  const gitData = isFile(node) ? nodeGitData(node) : undefined;
  if (gitData && (gitData?.details?.length ?? 0 > 0)) {
    const days = gitData.details.map((d) => d.commit_day);
    if (gitData.last_update) {
      days.push(gitData.last_update);
    }
    if (gitData.creation_date) {
      days.push(gitData.creation_date);
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
  if (isDirectory(node)) {
    stats = node.children.reduce((memo, child) => {
      return gatherNodeStats(child, memo, depth + 1);
    }, stats);
  }
  return stats;
}

export function gatherGlobalStats(data: Tree) {
  const statsSoFar: TreeStats = {
    earliestCommit: undefined,
    latestCommit: undefined,
    maxDepth: 0,
    maxLoc: 0,
    churn: {
      maxLines: 0,
      maxCommits: 0,
      maxDays: 0,
    },
  };
  return gatherNodeStats(data.tree, statsSoFar, 0);
}

type TimescaleData = {
  files: number;
  commits: number;
  lines_added: number;
  lines_deleted: number;
};

export type TimescaleIntervalData = {
  day: Date;
  files: number;
  commits: number;
  lines_added: number;
  lines_deleted: number;
};

// yes, I'm modifying a parameter, it's hard to avoid in JavaScript with big data structures
// timeUnit is 'week' or similar, passed to https://momentjs.com/docs/#/manipulating/start-of/
function addTimescaleData(
  timescaleData: Map<number, TimescaleData>,
  node: TreeNode,
  timeUnit: unitOfTime.StartOf
) {
  const gitData = isFile(node) && nodeGitData(node);
  if (gitData && gitData.details && gitData.details.length > 0) {
    gitData.details.forEach((data) => {
      const startDate = moment.unix(data.commit_day).startOf(timeUnit).unix();
      let dateData = timescaleData.get(startDate);
      if (!dateData)
        dateData = {
          files: 0,
          commits: 0,
          lines_added: 0,
          lines_deleted: 0,
        };
      dateData.files += 1;
      dateData.commits += data.commits;
      dateData.lines_added += data.lines_added;
      dateData.lines_deleted += data.lines_deleted;
      timescaleData.set(startDate, dateData);
    });
  }
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addTimescaleData(timescaleData, child, timeUnit);
    });
  }
}

export function gatherTimescaleData(
  data: Tree,
  timeUnit: unitOfTime.StartOf
): TimescaleIntervalData[] {
  const timescaleData: Map<number, TimescaleData> = new Map();
  addTimescaleData(timescaleData, data.tree, timeUnit);
  // convert to a simple sorted array, as that's all we need really
  return [...timescaleData]
    .map(([day, dayData]) => {
      // convert to Javascript dates as d3 likes them - sigh.  I could do this on display?
      return { day: moment.unix(day).toDate(), ...dayData };
    })
    .sort((a, b) => a.day.getTime() - b.day.getTime());
}

// yes, I'm modifying a parameter, it's hard to avoid in JavaScript with big data structures
function addNodesByPath(nodesByPath: Map<string, TreeNode>, node: TreeNode) {
  // eslint-disable-next-line no-param-reassign
  nodesByPath.set(node.path, node);
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addNodesByPath(nodesByPath, child);
    });
  }
}

export function gatherNodesByPath(data: Tree): Map<string, TreeNode> {
  const nodesByPath = new Map();
  addNodesByPath(nodesByPath, data.tree);
  return nodesByPath;
}
