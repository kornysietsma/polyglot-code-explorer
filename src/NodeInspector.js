/* eslint-disable react/prop-types */
import React from "react";
import PathInspector from "./PathInspector";
import {
  nodeAge,
  nodeGitData,
  nodeIndentation,
  nodeIndentationData,
  nodeLocData,
  nodeRemoteHead,
  nodeRemoteUrl
} from "./nodeData";

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

const NodeInspector = props => {
  const { node, dispatch } = props;
  const age = nodeAge(node);
  const humanAge = humanizeDays(age);
  const ageText = `file last changed ${age} days ago (${humanAge})`;
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  const gitUrl = findGitUrl(node);
  return (
    <div>
      {gitUrl ? (
        <h3>
          {node.data.name}
          <a href={gitUrl} target="#">
            (remote code)
          </a>
        </h3>
      ) : (
        <h3>{node.data.name}</h3>
      )}
      <PathInspector node={node} dispatch={dispatch} />
      <p>File type: {locData.language}</p>
      <p>Lines of code: {locData.code}</p>
      {indentationData ? (
        <p>
          Indentation:
          <ul>
            <li>stddev: {indentationData.stddev}</li>
            <li>p90: {indentationData.p90}</li>
            <li>worst: {indentationData.p99}</li>
            <li>area: {indentationData.sum}</li>
          </ul>
        </p>
      ) : (
        ""
      )}
      {age ? <p>{ageText}</p> : ""}
    </div>
  );
};

export default NodeInspector;
