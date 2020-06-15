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

const NodeInspector = props => {
  const { node, dispatch } = props;
  const age = nodeAge(node);
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
      {age ? <p>Code age: {age} days</p> : ""}
    </div>
  );
};

export default NodeInspector;
