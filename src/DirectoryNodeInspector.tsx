import React from "react";

import { nodeCumulativeLinesOfCode } from "./nodeData";
import PathInspector from "./PathInspector";
import { DirectoryNode } from "./polyglot_data.types";
import { Action } from "./state";

const DirectoryNodeInspector = ({
  node,
  dispatch,
}: {
  node: DirectoryNode;
  dispatch: React.Dispatch<Action>;
}) => {
  const loc = nodeCumulativeLinesOfCode(node);
  return (
    <div>
      <h3>{node.name}</h3>
      <p>Directory:</p>
      <PathInspector node={node} dispatch={dispatch} />
      <p>Cumulative Lines of code: {loc}</p>
    </div>
  );
};

export default DirectoryNodeInspector;
