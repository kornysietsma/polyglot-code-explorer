/* eslint-disable react/prop-types */
import React from "react";
import PathInspector from "./PathInspector";
import {
  nodeAge,
  nodeLastCommitDay,
  nodeGitData,
  nodeIndentation,
  nodeIndentationData,
  nodeLocData,
  nodeNumberOfChangers,
  nodeRemoteHead,
  nodeRemoteUrl,
  nodeTopChangers,
  nodeChurnData,
  nodeCreationDate
} from "./nodeData";
import { humanizeDate } from "./datetimes";
import ToggleablePanel from "./ToggleablePanel";
import HelpPanel from "./HelpPanel";

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
      if (remote.endsWith(".git")) {
        remote = remote.substr(0, remote.length - 4);
      }
    }
    const head = nodeRemoteHead(current);
    if (head) {
      return `${remote}/blob/${head}/${suffix}`;
    }
    return `${remote}/blob/master/${suffix}`;
  }
  return undefined;
}

function humanizeDays(days) {
  let daysRemaining = days;
  let years = 0;
  let weeks = 0; // no months, as they are not really precise
  if (daysRemaining > 365) {
    years = Math.floor(daysRemaining / 365);
    daysRemaining %= 365;
  }
  if (daysRemaining > 7) {
    weeks = Math.floor(daysRemaining / 7);
    daysRemaining %= 7;
  }
  const yearText =
    years > 0 ? `${years} year${years > 1 ? "s" : ""}` : undefined;
  const weekText =
    weeks > 0 ? `${weeks} week${weeks > 1 ? "s" : ""}` : undefined;
  const dayText =
    daysRemaining > 0
      ? `${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`
      : undefined;
  return [yearText, weekText, dayText].filter(t => t !== undefined).join(", ");
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
          <th>Metric</th>
          <th>Total</th>
          <th>Per day</th>
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
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  const gitUrl = findGitUrl(node);
  const { earliest, latest } = state.config.dateRange;
  const { topChangersCount } = state.config.numberOfChangers;
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
            <th>User</th>
            <th>Change count</th>
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
    </div>
  );
};

export default NodeInspector;
