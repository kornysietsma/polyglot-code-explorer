// Aggregating a node's git history by user and by team: who changed what, how much, and which
// team gets the credit. Everything here works over a date range and an alias/ignore list, since
// those filters are what the UI actually varies.

import _ from "lodash";

import {
  FileNode,
  isDirectory,
  isFile,
  TreeNode,
} from "../polyglot_data.types";
import {
  FileChangeMetric,
  possiblyAlias,
  UserAliases,
  UserTeams,
} from "../state";
import { nodeChangeDetails } from "./gitChanges";

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
 * Finds the top teams by the given metric, split into at most `partitions` shares - one per
 * stripe of a team pattern. A team needs half a share to earn a stripe at all, so the result is
 * often shorter than `partitions`, and is `undefined` when no team has any of the metric.
 *
 * It is never *longer*: the pattern palette only has room for `partitions` colours, and the
 * result is sorted by name before it gets there, so an overshoot would be trimmed by team name
 * rather than by contribution - two teams with identical stats rendering differently depending
 * on what they were called.
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
  while (
    results.length < partitions &&
    workingStats.length > 0 &&
    workingStats[0]![1] >= halfQuota
  ) {
    results.push(workingStats[0]![0]);
    workingStats[0]![1] -= halfQuota + halfQuota;
    if (workingStats[0]![1] < 0) {
      workingStats = workingStats.slice(1);
    }
    workingStats.sort(([, statA], [, statB]) => statB - statA);
  }

  return results.sort();
}

// Note this is slightly messsy, but after profiling
// I found it is better to only accumulate the stat
// we care about, not all 4. Especially to avoid masses
// of pointless set manipulation.
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

  // these are redundant, but it seemed simpler
  // to use pairs of stats rather than a generic
  // `myStat: number | Set<number>` and a lot of
  // ugly type casting.
  // if the metric is days, uses `myDays` otherwise `myStat`
  let myStat = 0;
  const myDays: Set<number> = new Set();
  let otherStat = 0;
  const otherDays: Set<number> = new Set();

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
        switch (metric) {
          case "commits":
            myStat += commits;
            break;
          case "lines":
            myStat += lines_added + lines_deleted;
            break;
          case "files":
            myStat = 1;
            break;
          case "days":
            myDays.add(commit_day);
            break;
        }
      } else {
        switch (metric) {
          case "commits":
            otherStat += commits;
            break;
          case "lines":
            otherStat += lines_added + lines_deleted;
            break;
          case "files":
            otherStat = 1;
            break;
          case "days":
            otherDays.add(commit_day);
            break;
        }
      }
    }
  );
  if (metric == "days") {
    return [myDays.size, otherDays.size];
  } else {
    return [myStat, otherStat];
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
