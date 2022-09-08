import { HierarchyNode } from "d3";
import _ from "lodash";

import {
  DirectoryNode,
  FileNode,
  GitData,
  GitDetails,
  IndentationData,
  isDirectory,
  isFile,
  LocData,
  TreeNode,
} from "./polyglot_data.types";
import {
  FileChangeMetric,
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

// TODO: inline this
export function nodeGitData(node: FileNode): GitData | undefined {
  return node.data.git;
}

export function nodeCreationDate(node: FileNode): number | undefined {
  const git = nodeGitData(node);
  if (!git) return undefined;

  return git.creation_date;
}

export function nodeCreationDateClipped(
  node: FileNode,
  earliest: number,
  latest: number
): number | undefined {
  const creationDate = nodeCreationDate(node);
  if (!creationDate) return undefined;
  if (creationDate > latest) return undefined;
  if (creationDate < earliest) return undefined;
  return creationDate;
}

export function nodeRemoteUrl(node: DirectoryNode): string | undefined {
  return node.data?.git.remote_url;
}

export function nodeRemoteHead(node: DirectoryNode): string | undefined {
  return node.data?.git.head;
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

// Date range based data, mostly git details

function nodeChangeDetails(
  node: FileNode,
  earliest?: number,
  latest?: number
): GitDetails[] | undefined {
  const git = nodeGitData(node);
  if (!git) return undefined;
  const { details } = git;
  if (!details) return undefined;
  if (earliest === undefined || latest === undefined) return details;
  return details.filter(
    (d) => d.commit_day >= earliest && d.commit_day <= latest
  );
}

export function nodeLastCommitDay(
  node: FileNode,
  earliest: number,
  latest: number
) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details || details.length === 0) return undefined; // TODO: distinguish no history from undefined!
  return details[details.length - 1]?.commit_day;
}

export function nodeAge(node: FileNode, earliest: number, latest: number) {
  const lastCommit = nodeLastCommitDay(node, earliest, latest);
  if (!lastCommit) return undefined;
  return Math.ceil((latest - lastCommit) / (24 * 60 * 60));
}

export function nodeNumberOfChangers(
  node: FileNode,
  aliases: UserAliases,
  earliest: number,
  latest: number
) {
  const details = nodeChangeDetails(node, earliest, latest);
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
  earliest: number,
  latest: number
): ChurnData | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  let totalLines = 0;
  let totalCommits = 0;
  const totalDays = details.length;
  details.forEach((d) => {
    const changeSize = d.lines_added + d.lines_deleted;
    totalCommits += d.commits;
    totalLines += changeSize;
  });
  const duration = (latest - earliest) / (24 * 60 * 60);

  return {
    totalLines,
    totalCommits,
    totalDays,
    fractionalLines: totalLines / duration,
    fractionalCommits: totalCommits / duration,
    fractionalDays: totalDays / duration,
  };
}

export function nodeChurnDays(
  node: FileNode,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, earliest, latest);
  if (!data) return undefined;
  return data.fractionalDays;
}

export function nodeChurnCommits(
  node: FileNode,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, earliest, latest);
  if (!data) return undefined;
  return data.fractionalCommits;
}

export function nodeChurnLines(
  node: FileNode,
  earliest: number,
  latest: number
) {
  const data = nodeChurnData(node, earliest, latest);
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

type UserStatsAccumulator = {
  commits: number;
  lines: number;
  days: Set<number>;
  files: number;
};

export function metricFrom(
  stats: UserStatsAccumulator,
  metric: FileChangeMetric
) {
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
export type UserStats = {
  commits: number;
  lines: number;
  days: number;
  files: number;
  lastCommitDay?: number;
};

// accumulates all changes within a date range by user
export function nodeChangers(
  node: FileNode,
  aliases: UserAliases,
  earliest: number,
  latest: number
): Map<number, UserStatsAccumulator> | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<number, UserStatsAccumulator> = new Map();

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

export function sortedNodeChangers(
  changers: Map<number, UserStatsAccumulator>,
  metric: FileChangeMetric
): [number, UserStatsAccumulator][] {
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

// accumulates all changes within a date range by team
// Note we can't just sum results of nodeChangers() because a single change by
// multiple members of the same team would be added multiple times.
export function nodeChangersByTeam(
  node: FileNode,
  aliases: UserAliases,
  userTeams: UserTeams,
  earliest: number,
  latest: number
): Map<string, UserStatsAccumulator> | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<string, UserStatsAccumulator> = new Map();

  details.forEach(
    ({ users, commits, lines_added, lines_deleted, commit_day }) => {
      // aggregate users into teams - otherwise 3 users from the
      // same team would show as 3 changes!
      const teams: Set<string> = new Set(
        ...users.flatMap((user) => {
          const realUser = possiblyAlias(aliases, user);
          const teams = userTeams.get(realUser);
          return teams ?? new Set<string>();
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

export function sortedTeamChangers(
  changers: Map<string, UserStatsAccumulator>,
  metric: FileChangeMetric
): [string, UserStatsAccumulator][] {
  return [...changers].sort(([, teamA], [, teamB]) => {
    switch (metric) {
      case "lines":
        return teamB.lines - teamA.lines;
      case "commits":
        return teamB.commits - teamA.commits;
      case "files":
        return teamB.files - teamA.files;
      case "days":
        return teamB.days.size - teamA.days.size;
    }
  });
}

export function nodeTopTeam(
  node: FileNode,
  metric: FileChangeMetric,
  aliases: UserAliases,
  userTeams: UserTeams,
  earliest: number,
  latest: number
): string | undefined {
  const changers = nodeChangersByTeam(
    node,
    aliases,
    userTeams,
    earliest,
    latest
  );
  if (changers == undefined || changers.size == 0) {
    return undefined;
  }

  return sortedTeamChangers(changers, metric)[0]![0];
}

function addUserStats(
  userStats: Map<number, UserStatsAccumulator>,
  node: TreeNode,
  aliases: UserAliases,
  earliest: number,
  latest: number
) {
  if (isFile(node)) {
    const changers = nodeChangers(node, aliases, earliest, latest);
    if (changers) {
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
      addUserStats(userStats, child, aliases, earliest, latest);
    });
  }
}

function lastDay(days: number[]): number | undefined {
  return days.sort((a, b) => b - a)[0];
}

export function aggregateUserStats(
  node: TreeNode,
  state: State
): Map<number, UserStats> {
  const { config } = state;
  const { earliest, latest } = config.filters.dateRange;
  const { aliases } = config.userData;
  const userStats: Map<number, UserStatsAccumulator> = new Map();
  addUserStats(userStats, node, aliases, earliest, latest);
  return new Map(
    [...userStats].map(([userId, { commits, files, lines, days }]) => [
      userId,
      {
        commits,
        files,
        lines,
        days: days.size,
        lastCommitDay: lastDay([...days]),
      },
    ])
  );
}
