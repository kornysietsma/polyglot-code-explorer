import "./NodeInspector.css";

import React from "react";

import CouplingInspector from "./CouplingInspector";
import { humanizeDate, humanizeDays } from "./datetimes";
import NodeChangeInspector from "./NodeChangeInspector";
import {
  ChurnData,
  nodeAge,
  nodeChurnData,
  nodeCreationDate,
  nodeIndentationData,
  nodeLastChangeDay,
  nodeLocData,
  nodeRemoteHead,
  nodeRemoteUrl,
} from "./nodeData";
import PathInspector from "./PathInspector";
import {
  FeatureFlags,
  FileNode,
  isDirectory,
  TreeNode,
} from "./polyglot_data.types";
import SourceCodeInspector from "./SourceCodeInspector";
import { Action, State } from "./state";
import ToggleablePanel from "./ToggleablePanel";
import { VizMetadata } from "./viz.types";

function findGitUrl(node: TreeNode, remoteUrlTemplate: string) {
  let suffix = node.name;
  let current = node;
  while ((!isDirectory(current) || !nodeRemoteUrl(current)) && current.parent) {
    current = current.parent;
    if (!nodeRemoteUrl(current)) {
      suffix = `${current.name}/${suffix}`;
    }
  }
  if (!isDirectory(current)) return undefined;

  const remote = nodeRemoteUrl(current);

  if (!remote) return undefined;

  // sorry, gentle reader, for this ugly regex.
  // TODO: split this, clean it up, make it nicer, add some tests!
  const remoteRe =
    /^(\w+:\/\/(?<host>[^/]+)\/(?<path>.+)\/(?<project>[^/.]+)(\.git)?)|(\w+@(?<host2>[^:]+):(?<path2>.+)\/(?<project2>[^/.]+)(\.git)?)$/;

  if (!remoteRe.test(remote)) {
    console.error(`Can't match remote URL '${remote}'`);
    return undefined;
  }

  const match = remoteRe.exec(remote);
  if (match?.groups === undefined) {
    console.error(`Can't match remote URL with good groups: '${remote}'`);
    return undefined;
  }

  const { host, path, project } = match.groups.host
    ? {
        // url style
        host: match.groups.host,
        path: match.groups.path!,
        project: match.groups.project!,
      }
    : {
        // ssh style
        host: match.groups.host2!,
        path: match.groups.path2!,
        project: match.groups.project2!,
      };
  const headRef = nodeRemoteHead(current) || "master";

  return remoteUrlTemplate
    .replace("{host}", host)
    .replace("{path}", path)
    .replace("{project}", project)
    .replace("{ref}", headRef)
    .replace("{file}", suffix);
}

function churnReport(churnData: ChurnData | undefined) {
  if (!churnData) return null;
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

const NodeInspector = ({
  node,
  dispatch,
  state,
  metadata,
  features,
}: {
  node: FileNode;
  dispatch: React.Dispatch<Action>;
  state: State;
  metadata: VizMetadata;
  features: FeatureFlags;
}) => {
  const { stats } = metadata;
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  const gitUrl = findGitUrl(node, state.config.remoteUrlTemplate);
  const { earliest, latest } = state.config.filters.dateRange;

  const { ignoredUsers } = state.config.teamsAndAliases;

  const age = nodeAge(node, features, ignoredUsers, earliest, latest);
  const lastChange = nodeLastChangeDay(
    node,
    features,
    ignoredUsers,
    earliest,
    latest
  );
  const creationDate = nodeCreationDate(node, features);
  let creationText = creationDate
    ? `File created on ${humanizeDate(creationDate)}`
    : "";
  if (creationDate && creationDate > latest) {
    creationText += " (after current date selection)";
  }
  const ageText =
    age && lastChange
      ? `file last changed ${age} days ago on ${humanizeDate(
          lastChange
        )} (${humanizeDays(age)})`
      : "";

  const churnData = nodeChurnData(node, ignoredUsers, earliest, latest);

  return (
    <div>
      {gitUrl ? (
        <h3>
          {node.name}&nbsp;
          <a className={"remoteUrl"} href={gitUrl} target="#">
            (remote code)
          </a>
        </h3>
      ) : (
        <h3>{node.name}</h3>
      )}
      <button onClick={() => dispatch({ type: "selectNode", payload: "" })}>
        clear selection
      </button>
      <PathInspector node={node} dispatch={dispatch} />
      <SourceCodeInspector node={node} state={state} />
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
      {features.git ? (
        <NodeChangeInspector
          node={node}
          state={state}
          metadata={metadata}
          features={features}
        ></NodeChangeInspector>
      ) : (
        <></>
      )}
      {churnReport(churnData)}
      {features.coupling && stats.coupling ? (
        <CouplingInspector node={node} state={state} stats={stats.coupling} />
      ) : (
        ""
      )}
    </div>
  );
};

export default NodeInspector;
