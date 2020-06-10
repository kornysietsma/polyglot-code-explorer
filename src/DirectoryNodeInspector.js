/* eslint-disable react/prop-types */
import React from "react";
import PathInspector from "./PathInspector";
import {nodeAge, nodeCumulativeLinesOfCode, nodeIndentation, nodeIndentationData, nodeLocData} from "./nodeData";

const DirectoryNodeInspector = props => {
  const { node, dispatch } = props;
  const loc = nodeCumulativeLinesOfCode(node);
  return (
    <div>
        <h3>{node.data.name}</h3>
        <p>Directory:</p>
      <PathInspector node={node} dispatch={dispatch}/>
      <p>Cumulative Lines of code: {loc}</p>
    </div>
  );
};

export default DirectoryNodeInspector;
