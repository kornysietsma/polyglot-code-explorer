import React from "react";
import NodeInspector from "./NodeInspector";

const Inspector = props => {
  console.log("inspector props", props);
  const { state } = props;
  const hasSelection = state.nonD3Config.selectedNode != null;
  const { selectedNode } = state.nonD3Config;
  return (
    <aside className="Inspector">
      {hasSelection ? (
          <NodeInspector node={selectedNode}/>
      ) : (
        <p>Please click on the chart to select a file/folder</p>
      )}
    </aside>
  );
};

export default Inspector;
