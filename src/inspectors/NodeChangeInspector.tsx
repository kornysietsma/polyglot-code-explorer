import {
  aggregateTeamStats,
  aggregateUserStats,
  metricFrom,
  nodeChangers,
  nodeChangersByTeam,
  sortedUserStatsAccumulators,
} from "../nodeData";
import {
  assertFlag,
  DirectoryNode,
  displayUser,
  FeatureFlags,
  FileNode,
  isDirectory,
} from "../polyglot_data.types";
import { getUserData, State } from "../state";
import { userTeamListForUser } from "../UserTeamList";
import { VizMetadata } from "../viz.types";
import { teamOrNoTeamWidget } from "../widgets/TeamWidget";
import ToggleablePanel from "../widgets/ToggleablePanel";

const NodeChangeInspector = ({
  node,
  state,
  metadata,
  features,
}: {
  node: DirectoryNode | FileNode;
  state: State;
  metadata: VizMetadata;
  features: FeatureFlags;
}) => {
  assertFlag(features, "git");

  // const { stats, users } = metadata;
  const { earliest, latest } = state.config.filters.dateRange;
  const { aliases, teams, ignoredUsers } = state.config.teamsAndAliases;
  const { userTeams } = state.calculated;
  const { topChangersCount } = state.config.numberOfChangers;
  const { fileChangeMetric } = state.config;
  const { showNonTeamChanges } = state.config.teamVisualisation;
  const { users } = metadata;

  const userStats = isDirectory(node)
    ? aggregateUserStats(node, earliest, latest, aliases, ignoredUsers)
    : nodeChangers(node, aliases, ignoredUsers, earliest, latest) ?? new Map();

  const userChangers = sortedUserStatsAccumulators(userStats, fileChangeMetric);

  const topUserChangers = userChangers.slice(0, topChangersCount);
  const teamStats = isDirectory(node)
    ? aggregateTeamStats(
        node,
        earliest,
        latest,
        aliases,
        ignoredUsers,
        userTeams,
        showNonTeamChanges
      )
    : nodeChangersByTeam(
        node,
        aliases,
        ignoredUsers,
        userTeams,
        earliest,
        latest,
        showNonTeamChanges
      ) ?? new Map();
  const teamChangers = sortedUserStatsAccumulators(teamStats, fileChangeMetric);
  const topTeamChangers = teamChangers.slice(0, topChangersCount);

  const topChangerTable =
    topUserChangers.length > 0 ? (
      <div>
        <h5>Top {topChangersCount} changers:</h5>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Metric ({fileChangeMetric})</th>
              <th>Teams</th>
            </tr>
          </thead>
          <tbody>
            {topUserChangers.map(([user, stats]) => {
              return (
                <tr key={user}>
                  <td>{displayUser(getUserData(users, state, user))}</td>
                  <td>{metricFrom(stats, fileChangeMetric)}</td>
                  <td>{userTeamListForUser(state, user, false)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      ""
    );
  const topTeamChangerTable =
    topTeamChangers && topTeamChangers.length > 0 ? (
      <div>
        <h5>Top {topChangersCount} teams:</h5>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Metric ({fileChangeMetric})</th>
            </tr>
          </thead>
          <tbody>
            {topTeamChangers.map(([teamName, stats]) => {
              return (
                <tr key={teamName}>
                  <td>
                    {teamOrNoTeamWidget(
                      teamName,
                      teamName,
                      teams,
                      state,
                      teamName
                    )}
                  </td>
                  <td>{metricFrom(stats, fileChangeMetric)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      ""
    );
  return (
    <div>
      <ToggleablePanel title="file changers" showInitially={false}>
        {userChangers!.length > 0 ? (
          <h5>Unique users: {userChangers!.length}</h5>
        ) : (
          ""
        )}
        {topChangerTable}
      </ToggleablePanel>
      <ToggleablePanel title="file changers by team" showInitially={false}>
        {teamChangers!.length > 0 ? (
          <h5>Unique teams: {teamChangers!.length}</h5>
        ) : (
          ""
        )}
        {topTeamChangerTable}
      </ToggleablePanel>
    </div>
  );
};

export default NodeChangeInspector;
