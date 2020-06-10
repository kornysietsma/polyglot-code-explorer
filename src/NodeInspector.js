/* eslint-disable react/prop-types */
import React from "react";
import PathInspector from "./PathInspector";
import {nodeAge, nodeIndentation, nodeIndentationData, nodeLocData} from "./nodeData";
import DirectoryNodeInspector from "./DirectoryNodeInspector";

const NodeInspector = props => {
  const { node, dispatch } = props;
  const age = nodeAge(node);
  const locData = nodeLocData(node);
  const indentationData = nodeIndentationData(node);
  return (
    <div>
        <h3>{node.data.name}</h3>
        <PathInspector node={node}  dispatch={dispatch} />
        <p>File type: {locData.language}</p>
      <p>Lines of code: {locData.code}</p>
      {indentationData ? (
        <p>
          Indentation:
          <ul>
            <li>median: {indentationData.median}</li>
            <li>p75: {indentationData.p75}</li>
            <li>p90: {indentationData.p90}</li>
            <li>p99: {indentationData.p99}</li>
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
