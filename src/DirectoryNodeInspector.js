/* eslint-disable react/forbid-prop-types */

import React from "react";
import defaultPropTypes from "./defaultPropTypes";
import PathInspector from "./PathInspector";
import { nodeCumulativeLinesOfCode } from "./nodeData";

const DirectoryNodeInspector = props => {
  const { node, dispatch } = props;
  const loc = nodeCumulativeLinesOfCode(node);
  return (
    <div>
      <h3>{node.data.name}</h3>
      <p>Directory:</p>
      <PathInspector node={node} dispatch={dispatch} />
      <p>Cumulative Lines of code: {loc}</p>
    </div>
  );
};
DirectoryNodeInspector.propTypes = defaultPropTypes;
export default DirectoryNodeInspector;
