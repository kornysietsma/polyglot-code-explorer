/* eslint-disable react/forbid-prop-types */

import React from "react";
import defaultPropTypes from "./defaultPropTypes";
import styles from "./PathInspector.module.css";
import ToggleablePanel from "./ToggleablePanel";

const PathInspector = props => {
  const { node, dispatch } = props;

  let parents = [];
  let currentNode = node.parent;
  while (currentNode.parent) {
    // deliberately don't show root
    parents.push(currentNode);
    currentNode = currentNode.parent;
  }
  parents = parents.reverse();

  return (
    <ToggleablePanel title="Path" showInitially>
      <ul className={styles.pathlist}>
        {parents.map(parent => (
          <li key={parent.data.path}>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "selectNode",
                  payload: parent
                })
              }
            >
              {parent.data.name}
            </button>
          </li>
        ))}
      </ul>
    </ToggleablePanel>
  );
};
PathInspector.propTypes = defaultPropTypes;
export default PathInspector;
