import React from "react";

import { TreeNode } from "./polyglot_data.types";
import { Action } from "./state";
import ToggleablePanel from "./ToggleablePanel";

const PathInspector = ({
  node,
  dispatch,
}: {
  node: TreeNode;
  dispatch: React.Dispatch<Action>;
}) => {
  let parents = [];
  let currentNode = node.parent;
  while (currentNode && currentNode.parent) {
    // deliberately don't show root
    parents.push(currentNode);
    currentNode = currentNode.parent;
  }
  parents = parents.reverse();

  return (
    <ToggleablePanel title="Path" extraClass="SelectionNavigator" showInitially>
      <ul>
        {parents.map((parent) => (
          <li key={parent.path}>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "selectNode",
                  payload: parent.path,
                })
              }
            >
              {parent.name}
            </button>
          </li>
        ))}
      </ul>
    </ToggleablePanel>
  );
};

export default PathInspector;
