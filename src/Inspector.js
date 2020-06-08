/* eslint react/prop-types: 0 */
import React from "react";
import NodeInspector from "./NodeInspector";

const Inspector = props => {
  console.log("inspector props", props);
  const { state } = props;
  const { selectedNode } = state.config;
  const hasSelection = selectedNode != null;
  return (
    <aside className="Inspector">
      {hasSelection ? (
        <NodeInspector node={selectedNode} />
      ) : (
        <p>Please click on the chart to select a file/folder</p>
      )}
    </aside>
  );
};

export default Inspector;
