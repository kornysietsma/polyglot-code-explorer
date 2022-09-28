import * as d3 from "d3";
import _ from "lodash";
import moment, { unitOfTime } from "moment";

import { nodeLinesOfCode, nodeLocData } from "./nodeData";
import {
  DirectoryNode,
  FeatureFlags,
  GitUser,
  isDirectory,
  isFile,
  PolyglotData,
  TreeNode,
  UserData,
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

export function linkParents(data: PolyglotData) {
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

export function countLanguagesIn(data: PolyglotData): LanguagesMetadata {
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
    const colour = colours[index] ?? otherColour;
    languageMap.set(key, { ...val, colour });
    if (index < colours.length) {
      languageKey.push({ ...val, language: key, colour });
    }
  });
  return { languageKey, languageMap, otherColour };
}

function updateEarliestLatest(stats: TreeStats, newDate: number) {
  if (stats.earliest === undefined || newDate < stats.earliest) {
    stats.earliest = newDate;
  }
  if (stats.latest === undefined || newDate > stats.latest) {
    stats.latest = newDate;
  }
}

function gatherNodeStats(
  node: TreeNode,
  features: FeatureFlags,
  statsSoFar: TreeStats,
  depth: number
) {
  let stats = _.cloneDeep(statsSoFar);
  if (stats.maxDepth < depth) {
    stats.maxDepth = depth;
  }
  const loc = isFile(node) ? nodeLinesOfCode(node) : undefined;
  if (loc && loc > stats.maxLoc) {
    stats.maxLoc = loc;
  }
  if (features.git) {
    const gitData = isFile(node) ? node.data.git : undefined;
    if (gitData && (gitData?.details?.length ?? 0 > 0)) {
      const days = gitData.details.map((d) => d.commit_day);
      if (gitData.last_update) {
        days.push(gitData.last_update);
      }
      if (gitData.creation_date) {
        days.push(gitData.creation_date);
      }
      if (days.length == 0) {
        throw new Error("No days in git data");
      }
      days.sort();
      const earliest = days[0]!;
      const latest = days[days.length - 1]!;
      updateEarliestLatest(stats, earliest);
      updateEarliestLatest(stats, latest);
    }
  }
  if (features.file_stats) {
    if (node.data?.file_stats) {
      updateEarliestLatest(stats, node.data.file_stats.created);
      updateEarliestLatest(stats, node.data.file_stats.modified);
    }
  }
  if (isDirectory(node)) {
    stats = node.children.reduce((memo, child) => {
      return gatherNodeStats(child, features, memo, depth + 1);
    }, stats);
  }
  return stats;
}

export function gatherGlobalStats(data: PolyglotData) {
  const statsSoFar: TreeStats = {
    earliest: undefined,
    latest: undefined,
    maxDepth: 0,
    maxLoc: 0,
    churn: {
      maxLines: 0,
      maxCommits: 0,
      maxDays: 0,
    },
  };
  return gatherNodeStats(data.tree, data.features, statsSoFar, 0);
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
  features: FeatureFlags,
  timeUnit: unitOfTime.StartOf
) {
  if (features.git) {
    const gitData = isFile(node) && node.data.git;
    if (gitData && gitData.details && gitData.details.length > 0) {
      gitData.details.forEach((data) => {
        const startDate = moment.unix(data.commit_day).startOf(timeUnit).unix();
        let dateData = timescaleData.get(startDate);
        if (!dateData) {
          dateData = {
            files: 0,
            commits: 0,
            lines_added: 0,
            lines_deleted: 0,
          };
        }
        dateData.files += 1;
        dateData.commits += data.commits;
        dateData.lines_added += data.lines_added;
        dateData.lines_deleted += data.lines_deleted;
        timescaleData.set(startDate, dateData);
      });
    }
  } else if (features.file_stats) {
    const date = node.data?.file_stats?.modified;
    if (date !== undefined) {
      let dateData = timescaleData.get(date);
      if (!dateData) {
        dateData = {
          files: 0,
          commits: 0,
          lines_added: 0,
          lines_deleted: 0,
        };
      }
      dateData.files += 1;
      timescaleData.set(date, dateData);
    }
  }
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addTimescaleData(timescaleData, child, features, timeUnit);
    });
  }
}

export function gatherTimescaleData(
  data: PolyglotData,
  timeUnit: unitOfTime.StartOf
): TimescaleIntervalData[] {
  const timescaleData: Map<number, TimescaleData> = new Map();
  addTimescaleData(timescaleData, data.tree, data.features, timeUnit);
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
  nodesByPath.set(node.path, node);
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addNodesByPath(nodesByPath, child);
    });
  }
}

export function gatherNodesByPath(data: PolyglotData): Map<string, TreeNode> {
  const nodesByPath = new Map();
  addNodesByPath(nodesByPath, data.tree);
  return nodesByPath;
}

/** 
 *  Names and emails are converted so nulls become "", and tabs are replaced.
I don't think you can have a tab in git? but just in case.
I need tab-free names so later I can use "name\temail" as a map key.
*/
function stripTabs(text: string | undefined): string {
  if (text == undefined) return "";
  return text.replace("\t", "<tab>");
}

export function postprocessUsers(users: GitUser[] | undefined): UserData[] {
  if (users === undefined) {
    return [];
  }
  return users.map((user) => {
    return {
      id: user.id,
      name: stripTabs(user.user.name),
      email: stripTabs(user.user.email),
    };
  });
}
