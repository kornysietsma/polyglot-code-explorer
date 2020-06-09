import React from "react";
import _ from "lodash";
import styles from "./NodeInspector.module.css";

const NodeInspector = props => {
  const { node } = props;
  // console.error("node data:", node);
  const age = _.get(
    node,
    ["data", "data", "git", "age_in_days"],
    undefined
  );
  return (
    <div>
        <p>Path:</p>
      <ul className={styles.pathlist}>
        {node.data.path.split("/").map(pathbit => (
          <li>{pathbit}</li>
        ))}
      </ul>
      <p>Lines of code: {node.data.value}</p>
      {node.data.data && node.data.data.indentation ? (
        <p>
          Indentation:
          <ul>
            <li>median: {node.data.data.indentation.median}</li>
            <li>p75: {node.data.data.indentation.p75}</li>
            <li>p90: {node.data.data.indentation.p90}</li>
            <li>p99: {node.data.data.indentation.p99}</li>
          </ul>
        </p>
      ) : (
        ""
      )}
      {age ? <p>Code age: {age} days</p> : ""}
    </div>
  );
};

export default NodeInspector;
