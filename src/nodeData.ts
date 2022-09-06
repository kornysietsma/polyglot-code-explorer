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
import { State, UserAliases } from "./state";

// TODO: inline me
export function nodePath(node: TreeNode): string {
  return node.path;
}
export function nodeName(node: TreeNode): string {
  return node.name;
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

export function nodeTopChangers(
  node: FileNode,
  earliest: number,
  latest: number,
  maxPeople: number
): [number, number][] | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<number, number> = new Map();
  details.forEach(({ users, commits }) => {
    users.forEach((user) => {
      const prev = changerStats.get(user);
      if (!prev) {
        changerStats.set(user, commits);
      } else {
        changerStats.set(user, prev + commits);
      }
    });
  });

  return [...changerStats.entries()]
    .sort(([, ac], [, bc]) => {
      return bc - ac;
    })
    .slice(0, maxPeople);
}

export function nodeTopChangersByLines(
  node: FileNode,
  earliest: number,
  latest: number,
  maxPeople: number
): [number, number][] | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats = new Map();
  // eslint-disable-next-line camelcase
  details.forEach(({ users, lines_added, lines_deleted }) => {
    // eslint-disable-next-line camelcase
    const totLines = lines_added + lines_deleted;
    users.forEach((user) => {
      if (!changerStats.has(user)) {
        changerStats.set(user, totLines);
      } else {
        changerStats.set(user, changerStats.get(user) + totLines);
      }
    });
  });

  return [...changerStats.entries()]
    .sort(([, ac], [, bc]) => {
      return bc - ac;
    })
    .slice(0, maxPeople);
}

function setAsString<T>(set: Set<T>): string {
  // only works for sets of sortable things, needed as stupid es6 maps are broken with non-primitive keys
  return Array.from(set)
    .sort()
    .map((v) => `${v}`)
    .join("_");
}

export type Owners = {
  users: string;
  value: number;
  totalValue: number;
};

export function nodeOwners(
  node: FileNode,
  earliest: number,
  latest: number,
  threshold: number,
  linesNotCommits: boolean
): Owners | undefined {
  const details = linesNotCommits
    ? nodeTopChangersByLines(node, earliest, latest, 9999)
    : nodeTopChangers(node, earliest, latest, 9999);

  if (!details) return undefined;

  if (details.length > 0) {
    const totalValue = _.sumBy(details, ([, value]) => value);
    // OK, want to say "we have total value, we want to aggregate users until we have over the threshold percentage of the total"
    const thresholdValue = (threshold / 100.0) * totalValue;
    const users: Set<number> = new Set();
    let aggregatedValue = 0.0;
    // eslint-disable-next-line no-restricted-syntax
    for (const [user, value] of details) {
      aggregatedValue += value;
      users.add(user);
      if (aggregatedValue > thresholdValue) {
        break;
      }
    }

    return { users: setAsString(users), value: aggregatedValue, totalValue };
  }
  return { users: "", value: 0, totalValue: 0 };
}

export function nodeOwnersNamesOnly(node: FileNode, state: State) {
  const { config } = state;
  const { earliest, latest } = config.filters.dateRange;
  const { threshold, linesNotCommits } = config.owners;
  const owners = nodeOwners(node, earliest, latest, threshold, linesNotCommits);
  return owners ? owners.users : undefined;
}

export function nodeNumberOfChangers(
  node: FileNode,
  earliest: number,
  latest: number
) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changers = _.uniq(details.flatMap((d) => d.users));
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

export function nodeCouplingData(node: FileNode) {
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

export function nodeCouplingFiles(
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

export function nodeLayoutData(node: TreeNode) {
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
        const realUser = aliases.get(user) ?? user;
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
/* TODO
export function nodeChangersByTeam(
  node: FileNode,
  aliases: UserAliases,
  teams: Teams,
  earliest: number,
  latest: number
): Map<number, UserStatsAccumulator> | undefined {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats: Map<number, UserStatsAccumulator> = new Map();

  details.forEach(
    ({ users, commits, lines_added, lines_deleted, commit_day }) => {
      users.forEach((user) => {
        const realUser = aliases.get(user) ?? user;
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
*/

export function addUserStats(
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
