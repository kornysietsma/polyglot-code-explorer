/* eslint-disable react/prop-types */
import React from "react";
import _ from "lodash";
import styles from "./PathInspector.module.css";

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
    <div>
      <p>Path:</p>
      <ul className={styles.pathlist}>
        {parents.map(parent => (
          <li key={parent.data.path}>
            <button type="button"
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
    </div>
  );
};

export default PathInspector;
