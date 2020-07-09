/* eslint-disable react/prop-types */
import React from "react";

import ToggleablePanel from "./ToggleablePanel";
import { nodeCouplingFilesFiltered } from "./nodeData";
import { couplingDateRange } from "./couplingBuckets";
import { humanizeDate } from "./datetimes";

const CouplingInspector = props => {
  const { node, dispatch, state, stats } = props;
  const { earliest, latest } = state.config.dateRange;
  const { couplingConfig } = state;

  const { couplingStart, couplingEnd } = couplingDateRange(
    stats.coupling,
    earliest,
    latest
  );

  let files = nodeCouplingFilesFiltered(
    node,
    earliest,
    latest,
    couplingConfig.minRatio,
    couplingConfig.minDays,
    couplingConfig.maxCommonRoots
  );
  // this is ugly - but we can't return early if no coupling data
  //  or the toggleablepanel state gets lost when you change nodes!

  let title;
  let couplingDetails;
  if (files === undefined || files.length === 0) {
    title = (
      <h5>
        No coupling data in range {humanizeDate(couplingStart)} to
        {humanizeDate(couplingEnd)}
      </h5>
    );
    couplingDetails = <div />;
  } else {
    const { sourceCount } = files[0];
    files.sort((f1, f2) => f2.targetCount - f1.targetCount);
    files = files.slice(0, 20);
    title = (
      <h5>
        Source days: {sourceCount} in range {humanizeDate(couplingStart)} to
        {humanizeDate(couplingEnd)}
      </h5>
    );
    couplingDetails = (
      <table>
        <thead>
          <tr>
            <td>File</td>
            <td>Matching days</td>
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
    );
  }

  return (
    <ToggleablePanel title="Coupling" showInitially={false}>
      {title}
      {couplingDetails}
    </ToggleablePanel>
  );
};

export default CouplingInspector;
