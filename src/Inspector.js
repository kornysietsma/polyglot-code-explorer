/* eslint-disable react/forbid-prop-types */

import React from "react";
import defaultPropTypes from "./defaultPropTypes";
import NodeInspector from "./NodeInspector";
import DirectoryNodeInspector from "./DirectoryNodeInspector";
import { isDirectory } from "./nodeData";

const Inspector = (props) => {
  // console.log("inspector props", props);
  const { state, dispatch, dataRef } = props;
  const { metadata } = dataRef.current;
  const { selectedNode } = state.config;
  const hasSelection = selectedNode != null;
  const showDirectory = hasSelection && isDirectory(selectedNode);
  const nodeInspector = showDirectory ? (
    <DirectoryNodeInspector
      node={selectedNode}
      state={state}
      dispatch={dispatch}
      metadata={metadata}
    />
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
Inspector.propTypes = defaultPropTypes;
export default Inspector;
