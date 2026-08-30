import * as d3 from "d3";
import { fromUnixTime } from "date-fns";
import _ from "lodash";

import { nodeLinesOfCode, nodeLocData } from "./model/nodeAccessors";
import {
  DirectoryNode,
  FeatureFlags,
  GitUser,
  isCirclePacked,
  isDirectory,
  isFile,
  PolyglotData,
  TreeNode,
  UserData,
} from "./polyglot_data.types";
import { LanguagesMetadata, TreeStats } from "./viz.types";

function linkParentRecursively(node: TreeNode, parent: DirectoryNode) {
  node.parent = parent;
  node.circleAncestors =
    (parent.circleAncestors ?? 0) +
    (isCirclePacked(parent.layout.algorithm) ? 1 : 0);
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
  rootNode.circleAncestors = 0;
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

const minOf = (a: number, b: number) => Math.min(a, b);
const maxOf = (a: number, b: number) => Math.max(a, b);

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
    if (gitData && gitData.details.length > 0) {
      const days = gitData.details.map((d) => d.commit_day);
      if (gitData.last_update) {
        days.push(gitData.last_update);
      }
      if (gitData.creation_date) {
        days.push(gitData.creation_date);
      }
      // reduce rather than Math.min(...days) - a busy file's history can be long enough to hit
      // the argument-count limit on a spread
      updateEarliestLatest(stats, days.reduce(minOf));
      updateEarliestLatest(stats, days.reduce(maxOf));
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

// gatherTimescaleData is only ever called with "week"; widen this union if that changes.
export type TimescaleUnit = "week";

const SECONDS_PER_DAY = 86400;

/**
 * The start of the UTC week containing `unixSeconds`, in unix seconds.
 *
 * Integer arithmetic on whole days rather than a `Date`, so there is no timezone to get wrong:
 * the scanner emits day-aligned UTC timestamps, and the old `startOfWeek` pushed them through
 * local time, landing every bucket on local midnight instead of a real week boundary.
 *
 * The epoch was a Thursday, so `+ 4` shifts the day count to make Sunday the start of the week;
 * the remainder is then how far into that week the day falls. Leap years need no special case -
 * unix time is 86400 seconds per day by definition, leap seconds included, so the day count and
 * the weekday cycle never drift. The double modulo is belt and braces for timestamps before
 * 1969-12-28, where JavaScript's `%` returns a negative remainder; no source file is that old,
 * but the guard costs nothing, so don't "simplify" it away.
 */
function startOfUnit(unixSeconds: number, timeUnit: TimescaleUnit): number {
  switch (timeUnit) {
    case "week": {
      const day = Math.floor(unixSeconds / SECONDS_PER_DAY);
      const dayOfWeek = (((day + 4) % 7) + 7) % 7;
      return (day - dayOfWeek) * SECONDS_PER_DAY;
    }
  }
}

// Finds or creates the bucket `date` falls in, and hands it to `accumulate`. Both kinds of scan
// go through here so a git scan and a file_stats-only one bucket dates the same way.
function addToUnitBucket(
  timescaleData: Map<number, TimescaleData>,
  timeUnit: TimescaleUnit,
  date: number,
  accumulate: (bucket: TimescaleData) => void
) {
  const bucketStart = startOfUnit(date, timeUnit);
  const bucket = timescaleData.get(bucketStart) ?? {
    files: 0,
    commits: 0,
    lines_added: 0,
    lines_deleted: 0,
  };
  accumulate(bucket);
  timescaleData.set(bucketStart, bucket);
}

// yes, I'm modifying a parameter, it's hard to avoid in JavaScript with big data structures
function addTimescaleData(
  timescaleData: Map<number, TimescaleData>,
  node: TreeNode,
  features: FeatureFlags,
  timeUnit: TimescaleUnit
) {
  if (features.git) {
    const gitData = isFile(node) ? node.data.git : undefined;
    for (const detail of gitData?.details ?? []) {
      addToUnitBucket(timescaleData, timeUnit, detail.commit_day, (bucket) => {
        bucket.files += 1;
        bucket.commits += detail.commits;
        bucket.lines_added += detail.lines_added;
        bucket.lines_deleted += detail.lines_deleted;
      });
    }
  } else if (features.file_stats) {
    const modified = node.data?.file_stats?.modified;
    if (modified !== undefined) {
      addToUnitBucket(timescaleData, timeUnit, modified, (bucket) => {
        // a file_stats-only scan has no commit history, so all there is to count is the file
        bucket.files += 1;
      });
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
  timeUnit: TimescaleUnit
): TimescaleIntervalData[] {
  const timescaleData: Map<number, TimescaleData> = new Map();
  addTimescaleData(timescaleData, data.tree, data.features, timeUnit);
  // convert to a simple sorted array, as that's all we need really
  return [...timescaleData]
    .map(([day, dayData]) => {
      // convert to Javascript dates as d3 likes them - sigh.  I could do this on display?
      return { day: fromUnixTime(day), ...dayData };
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
  return text.replaceAll("\t", "<tab>");
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

/**
 * Index users by id, and check the invariant the rest of the app relies on: the data file's
 * user list is dense, with `users[i].id === i`.
 *
 * Nothing in the data format promises this, but two things assume it. Alias ids are allocated
 * from `users.length` upward, so a gap in the real ids means an alias silently collides with a
 * real user; and `UsersAndTeams` indexes its combined user/alias list positionally. A sparse
 * list is therefore unsupported rather than merely slow, and this says so on load rather than
 * letting it surface as a mis-attributed commit or an `Invalid user id` from inside the
 * Inspector.
 */
export function indexUsersById(users: UserData[]): Map<number, UserData> {
  const byId: Map<number, UserData> = new Map();
  users.forEach((user, index) => {
    if (user.id !== index) {
      throw new Error(
        `User at position ${index} in the data file has id ${user.id} - the user list must be dense, listing every user in id order with no gaps`
      );
    }
    byId.set(user.id, user);
  });
  return byId;
}
