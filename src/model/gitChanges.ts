// A file's git change history, read through the date range and ignored-user filters the UI
// supplies: what changed, when it last changed, how old that makes it, and how much churn it
// has seen. `nodeChangeDetails` is the funnel everything else here goes through, and it is what
// `model/teamStats.ts` builds its per-user aggregation on top of.

import _ from "lodash";

import {
  FeatureFlags,
  FileNode,
  GitDetails,
  isFile,
  TreeNode,
} from "../polyglot_data.types";
import { FileMaxima, possiblyAlias, State, UserAliases } from "../state";

function detailsWithinDates(
  earliest: number,
  latest: number
): (detail: GitDetails) => boolean {
  return (detail: GitDetails) =>
    detail.commit_day >= earliest && detail.commit_day <= latest;
}

function removeIgnoredUsers(
  ignoredUsers: Set<number>
): (details: GitDetails) => GitDetails {
  if (ignoredUsers.size == 0) {
    return (details) => details;
  } else {
    return (detail) => {
      const notIgnoredUsers = detail.users.filter((u) => !ignoredUsers.has(u));
      return { ...detail, users: notIgnoredUsers };
    };
  }
}

function detailHasUsers(detail: GitDetails): boolean {
  return detail.users.length > 0;
}

// Date range based git details - the funnel every other reader of a file's history goes
// through, here and in `teamStats.ts`.
export function nodeChangeDetails(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
): GitDetails[] | undefined {
  const details = node.data.git?.details;
  if (!details) return undefined;
  return details
    .filter(detailsWithinDates(earliest, latest))
    .map(removeIgnoredUsers(ignoredUsers))
    .filter(detailHasUsers);
}

export function nodeLastChangeDay(
  node: FileNode,
  features: FeatureFlags,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  if (features.git) {
    const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
    if (!details || details.length === 0) return undefined; // TODO: distinguish no history from undefined!
    return details[details.length - 1]?.commit_day;
  } else {
    return node.data.file_stats?.modified;
  }
}

// Node age in days  (not seconds!)
export function nodeAge(
  node: FileNode,
  features: FeatureFlags,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  const lastDay = nodeLastChangeDay(
    node,
    features,
    ignoredUsers,
    earliest,
    latest
  );
  // Not fixed, only recorded: `!lastDay` is falsy for day 0 as well as for undefined, so a file
  // last changed on 1 Jan 1970 reads as having no history at all. Harmless for real scanner
  // output - no repo has a commit on the epoch - but it is a truthiness check standing in for a
  // presence check, and it is wrong for the reason it looks wrong.
  if (!lastDay) return undefined;
  return Math.ceil((latest - lastDay) / (24 * 60 * 60));
}

export function nodeNumberOfChangers(
  node: FileNode,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
  if (!details) return undefined;
  const changers = _.uniq(
    details.flatMap((d) => d.users.map((u) => possiblyAlias(aliases, u)))
  );
  return changers.length;
}

export type ChurnData = {
  totalLines: number;
  totalCommits: number;
  totalDays: number;
  fractionalLines: number;
  fractionalCommits: number;
  fractionalDays: number;
};

export function nodeChurnData(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
): ChurnData | undefined {
  const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
  if (!details) return undefined;
  let totalLines = 0;
  let totalCommits = 0;
  const totalDays = new Set<number>();
  details.forEach((d) => {
    const changeSize = d.lines_added + d.lines_deleted;
    totalCommits += d.commits;
    totalLines += changeSize;
    totalDays.add(d.commit_day);
  });
  const duration = (latest - earliest) / (24 * 60 * 60);

  return {
    totalLines,
    totalCommits,
    totalDays: totalDays.size,
    fractionalLines: totalLines / duration,
    fractionalCommits: totalCommits / duration,
    fractionalDays: totalDays.size / duration,
  };
}

export function nodeChurnDays(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, ignoredUsers, earliest, latest);
  if (!data) return undefined;
  return data.fractionalDays;
}

export function nodeChurnCommits(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, ignoredUsers, earliest, latest);
  if (!data) return undefined;
  return data.fractionalCommits;
}

export function nodeChurnLines(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, ignoredUsers, earliest, latest);
  if (!data) return undefined;
  return data.fractionalLines;
}

export function findMaxima(
  node: TreeNode,
  maxima: FileMaxima,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
): void {
  if (isFile(node)) {
    const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
    if (!details) return undefined;
    maxima.files = 1;
    let totalLines = 0;
    let totalCommits = 0;
    const totalDays = new Set<number>();
    details.forEach((d) => {
      const changeSize = d.lines_added + d.lines_deleted;
      totalCommits += d.commits;
      totalLines += changeSize;
      totalDays.add(d.commit_day);
    });
    if (totalLines > maxima.lines) {
      maxima.lines = totalLines;
    }
    if (totalCommits > maxima.commits) {
      maxima.commits = totalCommits;
    }
    if (totalDays.size > maxima.days) {
      maxima.days = totalDays.size;
    }
  } else {
    node.children.forEach((child) => {
      findMaxima(child, maxima, ignoredUsers, earliest, latest);
    });
  }
}

export function calculateFileMaxima(state: State, tree: TreeNode): FileMaxima {
  const { config } = state;
  const { ignoredUsers } = config.teamsAndAliases;

  const { earliest, latest } = config.filters.dateRange;
  const maxima: FileMaxima = { days: 0, commits: 0, lines: 0, files: 0 };
  findMaxima(tree, maxima, ignoredUsers, earliest, latest);
  console.log("found maxima:", maxima);
  return maxima;
}
