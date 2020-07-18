/* eslint-disable react/prop-types */
import React from "react";
import PathInspector from "./PathInspector";
import CouplingInspector from "./CouplingInspector";
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
  nodeTopChangers
} from "./nodeData";
import { humanizeDate, humanizeDays } from "./datetimes";
import ToggleablePanel from "./ToggleablePanel";

function findGitUrl(node) {
  let suffix = node.data.name;
  let current = node;
  while (!nodeRemoteUrl(current) && current.parent) {
    current = current.parent;
    if (!nodeRemoteUrl(current)) {
      suffix = `${current.data.name}/${suffix}`;
    }
  }
  let remote = nodeRemoteUrl(current);

  if (remote) {
    const sshRemoteRe = /\w+@([^:]+):([a-zA-Z./]+)/; // ssh login not http(s) url
    if (sshRemoteRe.test(remote)) {
      remote = remote.replace(sshRemoteRe, "https://$1/$2");
    }
    // TODO: these could be regex magic?
    if (remote.startsWith("git://")) {
      remote = `https://${remote.substr(6, remote.length)}`;
    }
    if (remote.endsWith(".git")) {
      remote = remote.substr(0, remote.length - 4);
    }
    const head = nodeRemoteHead(current);
    if (head) {
      return `${remote}/blob/${head}/${suffix}`;
    }
    return `${remote}/blob/master/${suffix}`;
  }
  return undefined;
}

function churnReport(churnData) {
  if (!churnData) return "";
  const {
    totalLines,
    totalCommits,
    totalDays,
    fractionalLines,
    fractionalCommits,
    fractionalDays
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

const NodeInspector = props => {
  const { node, dispatch, state, metadata } = props;
  const { stats } = metadata;
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  const gitUrl = findGitUrl(node);
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
  const userName = userId => {
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
          <a href={gitUrl} target="#">
            (remote code)
          </a>
        </h3>
      ) : (
        <h3>{node.data.name}</h3>
      )}
      <PathInspector node={node} dispatch={dispatch} />
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

export default NodeInspector;
