import React from "react";

import {
  aggregateTeamStats,
  aggregateUserStats,
  metricFrom,
  nodeCumulativeLinesOfCode,
  sortedUserStats,
} from "./nodeData";
import PathInspector from "./PathInspector";
import { DirectoryNode, displayUser } from "./polyglot_data.types";
import { Action, getUserData, State } from "./state";
import SubdirInspector from "./SubdirInspector";
import { teamOrNoTeamWidget } from "./TeamWidget";
import ToggleablePanel from "./ToggleablePanel";
import { userTeamListForUser } from "./UserTeamList";
import { VizMetadata } from "./viz.types";

const DirectoryNodeInspector = ({
  node,
  dispatch,
  state,
  metadata,
}: {
  node: DirectoryNode;
  dispatch: React.Dispatch<Action>;
  state: State;
  metadata: VizMetadata;
}) => {
  // const { stats, users } = metadata;
  const { earliest, latest } = state.config.filters.dateRange;
  const { aliases, teams } = state.config.teamsAndAliases;
  const { userTeams } = state.calculated;
  const { topChangersCount } = state.config.numberOfChangers;
  const { fileChangeMetric } = state.config;
  const { showNonTeamChanges } = state.config.teamVisualisation;
  const { users } = metadata;

  const userChangers = sortedUserStats(
    aggregateUserStats(node, earliest, latest, aliases),
    fileChangeMetric
  );
  const topUserChangers = userChangers.slice(0, topChangersCount);
  const teamChangers = sortedUserStats(
    aggregateTeamStats(
      node,
      earliest,
      latest,
      aliases,
      userTeams,
      showNonTeamChanges
    ),
    fileChangeMetric
  );
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
    topTeamChangers.length > 0 ? (
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

  const loc = nodeCumulativeLinesOfCode(node);
  return (
    <div>
      {node.parent == undefined ? (
        <h3>No selection</h3>
      ) : (
        <div>
          <h3>{node.name}</h3>
          <button onClick={() => dispatch({ type: "selectNode", payload: "" })}>
            clear selection
          </button>
          <p>Directory:</p>
          <PathInspector node={node} dispatch={dispatch} />
        </div>
      )}
      <SubdirInspector node={node} dispatch={dispatch}></SubdirInspector>

      <p>Cumulative Lines of code: {loc}</p>
      <ToggleablePanel title="file changers" showInitially={false}>
        {userChangers.length > 0 ? (
          <h5>Unique users: {userChangers.length}</h5>
        ) : (
          ""
        )}
        {topChangerTable}
      </ToggleablePanel>
      <ToggleablePanel title="file changers by team" showInitially={false}>
        {teamChangers.length > 0 ? (
          <h5>Unique teams: {teamChangers.length}</h5>
        ) : (
          ""
        )}
        {topTeamChangerTable}
      </ToggleablePanel>
    </div>
  );
};

export default DirectoryNodeInspector;
