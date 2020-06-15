/* eslint react/prop-types: 0 */
import React from "react";
import NodeInspector from "./NodeInspector";
import DirectoryNodeInspector from "./DirectoryNodeInspector";
import { isDirectory } from "./nodeData";

const Inspector = props => {
  // console.log("inspector props", props);
  const { state, dispatch } = props;
  const { selectedNode } = state.config;
  const hasSelection = selectedNode != null;
  const showDirectory = hasSelection && isDirectory(selectedNode);
  const nodeInspector = showDirectory ? (
    <DirectoryNodeInspector node={selectedNode} dispatch={dispatch} />
  ) : (
    <NodeInspector node={selectedNode} dispatch={dispatch} />
  );
  return (
    <aside className="Inspector">
      {hasSelection ? (
        nodeInspector
      ) : (
        <p>Please click on the chart to select a file/folder</p>
      )}
    </aside>
  );
};

export default Inspector;
