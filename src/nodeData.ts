import { HierarchyNode } from "d3";
import _ from "lodash";

import {
  DirectoryNode,
  FeatureFlags,
  FileNode,
  GitDetails,
  IndentationData,
  isDirectory,
  isFile,
  LocData,
  TreeNode,
} from "./polyglot_data.types";
import {
  FileChangeMetric,
  FileMaxima,
  possiblyAlias,
  State,
  UserAliases,
  UserTeams,
} from "./state";

// TODO: inline me
export function nodePath(node: TreeNode): string {
  return node.path;
}

function addDescendants(nodes: TreeNode[], node: TreeNode): void {
  nodes.push(node);
  if (isDirectory(node)) {
    node.children.forEach((child) => addDescendants(nodes, child));
  }
}
// like d3.descendants but for tree nodes
export function nodeDescendants(node: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  if (isDirectory(node)) {
    node.children.forEach((child) => addDescendants(nodes, child));
  }
  return nodes;
}

export function nodeLocData(node: FileNode): LocData {
  return node.data.loc;
}

export function nodeLanguage(node: FileNode): string {
  const loc = nodeLocData(node);
  return loc.language;
}

export function nodeLinesOfCode(node: FileNode): number {
  return node.data.loc.code;
}

export function nodeCumulativeLinesOfCode(node: TreeNode): number {
  return node.value;
}

export function nodeDepth(
  d: HierarchyNode<FileNode> | HierarchyNode<DirectoryNode>
): number {
  return d.depth;
}

export function nodeCreationDate(
  node: FileNode,
  features: FeatureFlags
): number | undefined {
  if (features.git) {
    return node.data.git?.creation_date;
  } else if (features.file_stats) {
    return node.data.file_stats?.created;
  } else {
    throw new Error("Must have git or file_stats feature enabled");
  }
}

export function nodeCreationDateClipped(
  node: FileNode,
  features: FeatureFlags,
  earliest: number,
  latest: number
): number | undefined {
  const creationDate = nodeCreationDate(node, features);
  if (!creationDate) return undefined;
  if (creationDate > latest) return undefined;
  if (creationDate < earliest) return undefined;
  return creationDate;
}

export function nodeRemoteUrl(node: DirectoryNode): string | undefined {
  return node.data?.git?.remote_url;
}

export function nodeRemoteHead(node: DirectoryNode): string | undefined {
  return node.data?.git?.head;
}

export function nodeIndentationData(
  node: FileNode
): IndentationData | undefined {
  return node.data.indentation;
}

export function nodeIndentation(
  node: FileNode,
  metric: "sum" | "p99" | "stddev"
) {
  if (!node.data.indentation) return undefined;
  return node.data.indentation[metric];
}

function filterDetailsIgnoringUsers(
  details: GitDetails[],
  ignoredUsers: Set<number>
): GitDetails[] {
  if (ignoredUsers.size == 0) {
    return details;
  }
  return details
    .map((detail) => {
      const notIgnoredUsers = detail.users.filter((u) => !ignoredUsers.has(u));
      return { ...detail, users: notIgnoredUsers };
    })
    .filter((detail) => detail.users.length > 0);
}

// Date range based git details
function nodeChangeDetails(
  node: FileNode,
  ignoredUsers: Set<number>,
  earliest?: number,
  latest?: number
): GitDetails[] | undefined {
  const details = node.data.git?.details;
  if (!details) return undefined;
  if (earliest === undefined || latest === undefined)
    return filterDetailsIgnoringUsers(details, ignoredUsers);
  const detailsWithinDates = details.filter(
    (d) => d.commit_day >= earliest && d.commit_day <= latest
  );
  return filterDetailsIgnoringUsers(detailsWithinDates, ignoredUsers);
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

function nodeCouplingData(node: FileNode) {
  return node.data.coupling;
}

export function nodeHasCouplingData(node: TreeNode) {
  return isFile(node) && nodeCouplingData(node) !== undefined;
}

export type CouplingLink = {
  source: TreeNode;
  targetFile: string;
  sourceCount: number;
  targetCount: number;
};

function nodeCouplingFiles(
  node: TreeNode,
  earliest: number,
  latest: number
): CouplingLink[] | undefined {
  if (isDirectory(node)) {
    return undefined;
  }
  const couplingData = nodeCouplingData(node);
  if (!couplingData) return undefined;
  const buckets = couplingData.buckets.filter((bucket) => {
    if (bucket.bucket_start > latest) return false;
    if (bucket.bucket_end < earliest) return false;
    return true;
  });
  if (buckets.length === 0) {
    // nothing in current selection
    return [];
  }
  let totalBursts = 0;
  const files: Map<string, number> = new Map();
  buckets.forEach((bucket) => {
    totalBursts += bucket.activity_bursts;
    bucket.coupled_files.forEach(([filename, count]) => {
      files.set(filename, (files.get(filename) ?? 0) + count);
    });
  });
  // convert to array so vis.js can render each coupling line
  return [...files].map(([file, count]) => {
    return {
      source: node,
      targetFile: file,
      sourceCount: totalBursts,
      targetCount: count,
    };
  });
}

function commonRoots(file1: string, file2: string) {
  const f1bits = file1.split("/");
  const f2bits = file2.split("/");
  let maxLength = f1bits.length;
  if (f2bits.length < maxLength) {
    maxLength = f2bits.length;
  }
  let commonLength = 0;
  let index = 0;
  while (f1bits[index] === f2bits[index]) {
    commonLength += 1;
    if (index >= maxLength) break;
    index += 1;
  }
  return commonLength;
}

function filesHaveMaxCommonRoots(
  maxCommonRoots: number,
  file1: string,
  file2: string
) {
  if (maxCommonRoots < 0) return true;
  const common = commonRoots(file1, file2);
  return common <= maxCommonRoots;
}

export function nodeCouplingFilesFiltered(
  node: TreeNode,
  earliest: number,
  latest: number,
  minRatio: number,
  minBursts: number,
  maxCommonRoots: number
) {
  const files = nodeCouplingFiles(node, earliest, latest);
  if (files === undefined || files.length === 0) return files;
  return files.filter((f) => {
    return (
      f.sourceCount >= minBursts &&
      f.targetCount / f.sourceCount > minRatio &&
      filesHaveMaxCommonRoots(maxCommonRoots, nodePath(f.source), f.targetFile)
    );
  });
}

function nodeLayoutData(node: TreeNode) {
  if (isDirectory(node)) {
    return undefined;
  }
  return node.layout;
}

export function nodeCenter(node: TreeNode) {
  return nodeLayoutData(node)?.center;
}

export type UserStats = {
  commits: number;
  lines: number;
  days: Set<number>;
  files: number;
};
export const DEFAULT_USER_STATS: UserStats = {
  commits: 0,
  lines: 0,
  days: new Set(),
  files: 0,
};

export function metricFrom(stats: UserStats, metric: FileChangeMetric) {
  switch (metric) {
    case "commits":
      return stats.commits;
    case "lines":
      return stats.lines;
    case "days":
      return stats.days.size;
    case "files":
      return stats.files;
  }
}

/** when aggregating by team, we flag changes by users with no team */
export const NO_TEAM_SYMBOL = "<NO TEAM>";

// accumulates all changes within a date range by user
export function nodeChangers(
  node: FileNode,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
): Map<number, UserStats> | undefined {
  const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<number, UserStats> = new Map();

  details.forEach(
    ({ users, commits, lines_added, lines_deleted, commit_day }) => {
      users.forEach((user) => {
        const realUser = possiblyAlias(aliases, user);
        let myStats = changerStats.get(realUser);
        if (!myStats) {
          myStats = { commits: 0, lines: 0, days: new Set(), files: 1 };
        }
        myStats.commits += commits;
        myStats.lines += lines_added + lines_deleted;
        myStats.days.add(commit_day);
        changerStats.set(realUser, myStats);
      });
    }
  );

  return changerStats;
}

// accumulates all changes within a date range by team
// Note we can't just sum results of nodeChangers() because a single change by
// multiple members of the same team would be added multiple times.
export function nodeChangersByTeam(
  node: FileNode,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number,
  includeNonTeamChanges: boolean
): Map<string, UserStats> | undefined {
  const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<string, UserStats> = new Map();

  const noTeamEntry = includeNonTeamChanges ? [NO_TEAM_SYMBOL] : [];

  details.forEach(
    ({ users, commits, lines_added, lines_deleted, commit_day }) => {
      // aggregate users into teams - otherwise 3 users from the
      // same team would show as 3 changes!
      const teams: Set<string> = new Set(
        users.flatMap((user) => {
          const realUser = possiblyAlias(aliases, user);
          const teams = userTeams.get(realUser);

          return teams ? [...teams] : noTeamEntry;
        })
      );

      for (const team of teams) {
        let myStats = changerStats.get(team);
        if (!myStats) {
          myStats = { commits: 0, lines: 0, days: new Set(), files: 1 };
        }
        myStats.commits += commits;
        myStats.lines += lines_added + lines_deleted;
        myStats.days.add(commit_day);
        changerStats.set(team, myStats);
      }
    }
  );

  return changerStats;
}

export function sortedUserStatsAccumulators<KeyType>(
  changers: Map<KeyType, UserStats>,
  metric: FileChangeMetric
): [KeyType, UserStats][] {
  return [...changers].sort(([, userA], [, userB]) => {
    switch (metric) {
      case "lines":
        return userB.lines - userA.lines;
      case "commits":
        return userB.commits - userA.commits;
      case "files":
        return userB.files - userA.files;
      case "days":
        return userB.days.size - userA.days.size;
    }
  })!;
}

export function nodeTopTeam(
  node: FileNode,
  metric: FileChangeMetric,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number,
  includeNonTeamChanges: boolean
): string | undefined {
  const changers = nodeChangersByTeam(
    node,
    aliases,
    ignoredUsers,
    userTeams,
    earliest,
    latest,
    includeNonTeamChanges
  );
  if (changers == undefined || changers.size == 0) {
    return undefined;
  }

  const sortedTeams = sortedUserStatsAccumulators(changers, metric).map(
    ([team]) => team
  );
  return sortedTeams![0];
}

function singleStat(stats: UserStats, metric: FileChangeMetric): number {
  switch (metric) {
    case "lines":
      return stats.lines;
    case "commits":
      return stats.commits;
    case "files":
      return stats.files;
    case "days":
      return stats.days.size;
  }
}

/**
 * finds the top teams by given metric, split into N partitions
 * for striped patterns (so usually 2 for 2 stripes)
 * @param teamStats
 * @param metric
 * @param partitions
 * @returns
 */
export function topTeamsPartitioned(
  teamStats: Map<string, UserStats>,
  metric: FileChangeMetric,
  partitions: number,
  includeNonTeamChanges: boolean
): string[] | undefined {
  let statTotal = 0;
  let workingStats: [string, number][] = [...teamStats]
    .map(([teamName, stats]) => {
      const stat = singleStat(stats, metric);
      statTotal += stat;
      return [teamName, stat] as [string, number];
    })
    .sort(([, statA], [, statB]) => statB - statA);
  if (!includeNonTeamChanges) {
    workingStats = workingStats.filter(
      ([teamName]) => teamName != NO_TEAM_SYMBOL
    );
  }
  if (statTotal == 0) {
    return undefined;
  }
  const halfQuota = statTotal / (partitions * 2);
  const results: string[] = [];
  while (workingStats.length > 0 && workingStats[0]![1] >= halfQuota) {
    results.push(workingStats[0]![0]);
    workingStats[0]![1] -= halfQuota + halfQuota;
    if (workingStats[0]![1] < 0) {
      workingStats = workingStats.slice(1);
    }
    workingStats.sort(([, statA], [, statB]) => statB - statA);
  }

  return results.sort();
}

export function nodeSingleTeam(
  node: FileNode,
  thisTeamName: string,
  metric: FileChangeMetric,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number
): [ownContribution: number, otherContribution: number] | undefined {
  const details = nodeChangeDetails(node, ignoredUsers, earliest, latest);
  if (!details || details.length == 0) return undefined;

  const myStats: UserStats = {
    commits: 0,
    lines: 0,
    days: new Set(),
    files: 0,
  };
  const otherStats: UserStats = {
    commits: 0,
    lines: 0,
    days: new Set(),
    files: 0,
  };

  details.forEach(
    ({ users, commits, lines_added, lines_deleted, commit_day }) => {
      // this change counts to the current team if any users are in the team
      const isThisTeam =
        users.find((user) => {
          const realUser = possiblyAlias(aliases, user);
          const teams = userTeams.get(realUser);
          if (teams == undefined) return false;
          return teams.has(thisTeamName);
        }) != undefined;
      if (isThisTeam) {
        myStats.commits += commits;
        myStats.lines += lines_added + lines_deleted;
        myStats.days.add(commit_day);
        myStats.files = 1;
      } else {
        otherStats.commits += commits;
        otherStats.lines += lines_added + lines_deleted;
        otherStats.days.add(commit_day);
        otherStats.files = 1;
      }
    }
  );
  switch (metric) {
    case "commits":
      return [myStats.commits, otherStats.commits];
    case "lines":
      return [myStats.lines, otherStats.lines];
    case "days":
      return [myStats.days.size, otherStats.days.size];
    case "files":
      // kind of pointless?
      return [myStats.files, otherStats.files];
  }
}

function addUserStats(
  userStats: Map<number, UserStats>,
  node: TreeNode,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  earliest: number,
  latest: number
) {
  if (isFile(node)) {
    const changers = nodeChangers(
      node,
      aliases,
      ignoredUsers,
      earliest,
      latest
    );
    if (changers !== undefined) {
      for (const [userId, { commits, lines, days }] of changers) {
        const stats = userStats.get(userId);
        if (stats === undefined) {
          userStats.set(userId, {
            commits,
            lines,
            days,
            files: 1,
          });
        } else {
          stats.commits += commits;
          stats.lines += lines;
          days.forEach(function (d) {
            stats.days.add(d);
          });
          stats.files += 1;
        }
      }
    }
  }
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addUserStats(userStats, child, aliases, ignoredUsers, earliest, latest);
    });
  }
}

export function addTeamStats(
  teamStats: Map<string, UserStats>,
  node: TreeNode,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number,
  includeNonTeamChanges: boolean
) {
  if (isFile(node)) {
    const changers = nodeChangersByTeam(
      node,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      includeNonTeamChanges
    );
    if (changers) {
      for (const [teamName, { commits, lines, days }] of changers) {
        const stats = teamStats.get(teamName);
        if (stats === undefined) {
          teamStats.set(teamName, {
            commits,
            lines,
            days,
            files: 1,
          });
        } else {
          stats.commits += commits;
          stats.lines += lines;
          days.forEach(function (d) {
            stats.days.add(d);
          });
          stats.files += 1;
        }
      }
    }
  }
  if (isDirectory(node)) {
    node.children.forEach((child) => {
      addTeamStats(
        teamStats,
        child,
        aliases,
        ignoredUsers,
        userTeams,
        earliest,
        latest,
        includeNonTeamChanges
      );
    });
  }
}

function lastDay(days: number[]): number | undefined {
  return days.sort((a, b) => b - a)[0];
}
export function lastCommitDay(stats: UserStats): number | undefined {
  return lastDay([...stats.days]);
}

export function aggregateUserStats(
  node: TreeNode,
  earliest: number,
  latest: number,
  aliases: UserAliases,
  ignoredUsers: Set<number>
): Map<number, UserStats> {
  const userStats: Map<number, UserStats> = new Map();
  addUserStats(userStats, node, aliases, ignoredUsers, earliest, latest);
  return userStats;
}

export function aggregateTeamStats(
  node: TreeNode,
  earliest: number,
  latest: number,
  aliases: UserAliases,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  includeNonTeamChanges: boolean
): Map<string, UserStats> {
  const teamStats: Map<string, UserStats> = new Map();
  addTeamStats(
    teamStats,
    node,
    aliases,
    ignoredUsers,
    userTeams,
    earliest,
    latest,
    includeNonTeamChanges
  );
  return teamStats;
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
