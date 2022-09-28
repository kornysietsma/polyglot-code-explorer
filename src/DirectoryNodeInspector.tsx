import React from "react";

import NodeChangeInspector from "./NodeChangeInspector";
import { nodeCumulativeLinesOfCode } from "./nodeData";
import PathInspector from "./PathInspector";
import { DirectoryNode, FeatureFlags } from "./polyglot_data.types";
import { Action, State } from "./state";
import SubdirInspector from "./SubdirInspector";
import { VizMetadata } from "./viz.types";

const DirectoryNodeInspector = ({
  node,
  dispatch,
  state,
  metadata,
  features,
}: {
  node: DirectoryNode;
  dispatch: React.Dispatch<Action>;
  state: State;
  metadata: VizMetadata;
  features: FeatureFlags;
}) => {
  const loc = nodeCumulativeLinesOfCode(node);
  return (
    <div>
      {node.parent == undefined ? (
        <h3>No selection</h3>
      ) : (
        <div>
          <h3>{node.name}</h3>
          <button onClick={() => dispatch({ type: "selectNode", payload: "" })}>
            clear selection
          </button>
          <p>Directory:</p>
          <PathInspector node={node} dispatch={dispatch} />
        </div>
      )}
      <SubdirInspector node={node} dispatch={dispatch}></SubdirInspector>

      <p>Cumulative Lines of code: {loc}</p>
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
    </div>
  );
};

export default DirectoryNodeInspector;
