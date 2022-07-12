/* eslint-disable react/forbid-prop-types */

import React from "react";
import defaultPropTypes from "./defaultPropTypes";
import PathInspector from "./PathInspector";
import CouplingInspector from "./CouplingInspector";
import styles from "./NodeInspector.module.css";
import {
  nodeAge,
  nodeChurnData,
  nodeCreationDate,
  nodeIndentationData,
  nodeLastCommitDay,
  nodeLocData,
  nodeNumberOfChangers,
  nodeRemoteHead,
  nodeRemoteUrl,
  nodeTopChangers,
} from "./nodeData";
import { humanizeDate, humanizeDays } from "./datetimes";
import ToggleablePanel from "./ToggleablePanel";
import SourceCodeInspector from "./SourceCodeInspector";

function findGitUrl(node, remoteUrlTemplate) {
  let suffix = node.data.name;
  let current = node;
  while (!nodeRemoteUrl(current) && current.parent) {
    current = current.parent;
    if (!nodeRemoteUrl(current)) {
      suffix = `${current.data.name}/${suffix}`;
    }
  }
  const remote = nodeRemoteUrl(current);

  if (!remote) return undefined;

  // sorry, gentle reader, for this ugly regex. 
  // TODO: split this, clean it up, make it nicer, add some tests!
  const remoteRe = /^(\w+:\/\/(?<host>[^/]+)\/(?<path>.+)\/(?<project>[^/.]+)(\.git)?)|(\w+@(?<host2>[^:]+):(?<path2>.+)\/(?<project2>[^/.]+)(\.git)?)$/;

  if (!remoteRe.test(remote)) {
    console.error(`Can't match remote URL '${remote}'`);
    return undefined;
  }

  const match = remoteRe.exec(remote);
  const { host, path, project } = match.groups.host
    ? {
        // url style
        host: match.groups.host,
        path: match.groups.path,
        project: match.groups.project,
      }
    : {
        // ssh style
        host: match.groups.host2,
        path: match.groups.path2,
        project: match.groups.project2,
      };
  const headRef = nodeRemoteHead(current) || "master";

  return remoteUrlTemplate
    .replace("{host}", host)
    .replace("{path}", path)
    .replace("{project}", project)
    .replace("{ref}", headRef)
    .replace("{file}", suffix);
}

function churnReport(churnData) {
  if (!churnData) return "";
  const {
    totalLines,
    totalCommits,
    totalDays,
    fractionalLines,
    fractionalCommits,
    fractionalDays,
  } = churnData;
  return (
    <ToggleablePanel title="Code Churn" showInitially={false}>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Total</th>
            <th>Per day</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Days with a change</td>
            <td>{totalDays}</td>
            <td>{fractionalDays.toFixed(4)}</td>
          </tr>
          <tr>
            <td>Commits</td>
            <td>{totalCommits}</td>
            <td>{fractionalCommits.toFixed(4)}</td>
          </tr>
          <tr>
            <td>Lines</td>
            <td>{totalLines}</td>
            <td>{fractionalLines.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </ToggleablePanel>
  );
}

const NodeInspector = (props) => {
  const { node, dispatch, state, metadata } = props;
  // UGLY - can't work out how to easily mix themes into module CSS?
  const { currentTheme } = state.config.colours;
  const { stats } = metadata;
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  const gitUrl = findGitUrl(node, state.config.remoteUrlTemplate);
  const { earliest, latest } = state.config.dateRange;
  const { topChangersCount } = state.config.numberOfChangers;
  const { couplingAvailable } = state.couplingConfig;
  const age = nodeAge(node, earliest, latest);
  const lastCommit = nodeLastCommitDay(node, earliest, latest);
  const creationDate = nodeCreationDate(node, earliest, latest);
  let creationText = creationDate
    ? `File created on ${humanizeDate(creationDate)}`
    : "";
  if (creationDate && creationDate > latest) {
    creationText += " (after current date selection)";
  }
  const ageText = age
    ? `file last changed ${age} days ago on ${humanizeDate(
        lastCommit
      )} (${humanizeDays(age)})`
    : "";
  const changerCount = nodeNumberOfChangers(node, earliest, latest);
  const topChangers = nodeTopChangers(node, earliest, latest, topChangersCount);
  const userName = (userId) => {
    const { user } = metadata.users[userId];
    if (user.name) {
      if (user.email) {
        return `${user.name} / ${user.email}`;
      }
      return user.name;
    }
    return user.email;
  };
  const topChangerTable =
    topChangers && topChangers.length > 0 ? (
      <div>
        <h5>Top {topChangersCount} changers:</h5>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Change count</th>
            </tr>
          </thead>
          <tbody>
            {topChangers.map(([user, count]) => {
              return (
                <tr>
                  <td>{userName(user)}</td>
                  <td>{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      ""
    );

  const churnData = nodeChurnData(node, earliest, latest);

  return (
    <div>
      {gitUrl ? (
        <h3>
          {node.data.name}&nbsp;
          <a
            className={
              currentTheme === "dark"
                ? styles.remoteUrlDark
                : styles.remoteUrlLight
            }
            href={gitUrl}
            target="#"
          >
            (remote code)
          </a>
        </h3>
      ) : (
        <h3>{node.data.name}</h3>
      )}
      <PathInspector node={node} dispatch={dispatch} />
      <SourceCodeInspector node={node} state={state} dispatch={dispatch} />
      <p>
        Selected date range {humanizeDate(earliest)} to {humanizeDate(latest)}
      </p>
      <ToggleablePanel title="basic stats" showInitially>
        <p>File type: {locData.language}</p>
        <p>Lines of code: {locData.code}</p>
        {creationDate ? (
          <p>{creationText}</p>
        ) : (
          "(not created in selected range)"
        )}
        {age ? <p>{ageText}</p> : ""}
      </ToggleablePanel>
      {indentationData ? (
        <ToggleablePanel title="Indentation" showInitially={false}>
          <ul>
            <li>stddev: {indentationData.stddev}</li>
            <li>p90: {indentationData.p90}</li>
            <li>worst: {indentationData.p99}</li>
            <li>area: {indentationData.sum}</li>
          </ul>
        </ToggleablePanel>
      ) : (
        ""
      )}
      <ToggleablePanel title="file changers" showInitially={false}>
        {changerCount ? <h5>Unique changers: {changerCount}</h5> : ""}
        {topChangerTable}
      </ToggleablePanel>
      {churnReport(churnData)}
      {couplingAvailable ? (
        <CouplingInspector
          node={node}
          dispatch={dispatch}
          state={state}
          stats={stats}
        />
      ) : (
        ""
      )}
    </div>
  );
};

NodeInspector.propTypes = defaultPropTypes;

export default NodeInspector;
