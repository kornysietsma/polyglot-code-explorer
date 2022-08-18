import React from "react";

import { DefaultProps } from "./components.types";
import DirectoryNodeInspector from "./DirectoryNodeInspector";
import NodeInspector from "./NodeInspector";
import { isDirectory } from "./polyglot_data.types";

const Inspector = (props: DefaultProps) => {
  const { state, dispatch, dataRef } = props;
  const { metadata } = dataRef.current;
  const { selectedNode: selectedNodePath } = state.config;

  const selectedNode =
    selectedNodePath === undefined
      ? undefined
      : metadata.nodesByPath.get(selectedNodePath);
  const hasSelection = selectedNode != null;
  const showDirectory = hasSelection && isDirectory(selectedNode);
  const nodeInspector = !hasSelection ? undefined : showDirectory ? (
    <DirectoryNodeInspector node={selectedNode} dispatch={dispatch} />
  ) : (
    <NodeInspector
      node={selectedNode}
      state={state}
      metadata={metadata}
      dispatch={dispatch}
    />
  );
  return (
    <aside className="Inspector">
      {hasSelection ? (
        nodeInspector
      ) : (
        <div>
          <p>Please click on the chart to select a file/folder</p>
          <p>
            <i>
              <b>Note </b>
            </i>
            there is a date selector at the bottom of the diagram!
          </p>
        </div>
      )}
    </aside>
  );
};

export default Inspector;
