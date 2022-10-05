import React from "react";

import { DirectoryNode, isDirectory } from "../polyglot_data.types";
import { Action } from "../state";
import ToggleablePanel from "../widgets/ToggleablePanel";

const SubdirInspector = ({
  node,
  dispatch,
}: {
  node: DirectoryNode;
  dispatch: React.Dispatch<Action>;
}) => {
  const subDirs = node.children.filter((node) => isDirectory(node));

  return subDirs.length > 0 ? (
    <ToggleablePanel
      title="Subdirectories"
      extraClass="SelectionNavigator"
      showInitially
    >
      <ul>
        {subDirs.map((node) => (
          <li key={node.path}>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "selectNode",
                  payload: node.path,
                })
              }
            >
              {node.name}
            </button>
          </li>
        ))}
      </ul>
    </ToggleablePanel>
  ) : (
    <></>
  );
};

export default SubdirInspector;
