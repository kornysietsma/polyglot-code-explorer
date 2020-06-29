/* eslint-disable react/prop-types */
import React from "react";

import ToggleablePanel from "./ToggleablePanel";
import { nodeCouplingFiles, nodeCouplingFilesFiltered } from "./nodeData";

const CouplingInspector = props => {
  const { node, dispatch, state } = props;
  const { earliest, latest } = state.config.dateRange;
  const { couplingConfig } = state;
  let files = nodeCouplingFilesFiltered(
    node,
    earliest,
    latest,
    couplingConfig.minRatio
  );
  if (files === undefined || files.length === 0) {
    return <h4>No coupling data</h4>;
  }
  const { sourceCount } = files[0];
  files.sort((f1, f2) => f2.targetCount - f1.targetCount);
  files = files.slice(0, 20);

  return (
    <ToggleablePanel title="Coupling" showInitially={false}>
      <h5>Source commits: {sourceCount} in date range</h5>
      <table>
        <thead>
          <tr>
            <td>File</td>
            <td>Matching commits</td>
            <td>Ratio</td>
          </tr>
        </thead>
        <tbody>
          {files.map(file => {
            const ratio = file.targetCount / file.sourceCount;
            return (
              <tr>
                <td>{file.targetFile}</td>
                <td>{file.targetCount}</td>
                {ratio.toFixed(3)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ToggleablePanel>
  );
};

export default CouplingInspector;
