import React from "react";

const NodeInspector = props => {
  const { node } = props;
  console.error("node data:", node);
  return (
    <div>
      <p>{node.name}</p>
      <p>Lines of code: {node.value}</p>
      {node.data && node.data.indentation ? (
        <p>
          Indentation:
          <ul>
            <li>median: {node.data.indentation.median}</li>
              <li>p75: {node.data.indentation.p75}</li>
              <li>p90: {node.data.indentation.p90}</li>
              <li>p99: {node.data.indentation.p99}</li>
          </ul>
        </p>
      ) : (
        ""
      )}
    </div>
  );
};

export default NodeInspector;
