import React from "react";

const NodeInspector = props => {
  const { node } = props;
  return (
    <div>
      <p>{node.name}</p>
      <p>Lines of code: {node.value}</p>
    </div>
  );
};

export default NodeInspector;
