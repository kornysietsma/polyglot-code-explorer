import { couplingDateRange } from "../couplingBuckets";
import { humanizeDate } from "../datetimes";
import { nodeCouplingFilesFiltered } from "../nodeData";
import { TreeNode } from "../polyglot_data.types";
import { State } from "../state";
import { CouplingStats } from "../viz.types";
import ToggleablePanel from "../widgets/ToggleablePanel";

const CouplingInspector = ({
  node,
  state,
  stats,
}: {
  node: TreeNode;
  state: State;
  stats: CouplingStats;
}) => {
  const { earliest, latest } = state.config.filters.dateRange;
  const { couplingConfig } = state;

  const { couplingStart, couplingEnd } = couplingDateRange(
    stats,
    earliest,
    latest
  );

  let files = nodeCouplingFilesFiltered(
    node,
    earliest,
    latest,
    couplingConfig.minRatio,
    couplingConfig.minBursts,
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
    const { sourceCount } = files[0]!;
    files.sort((f1, f2) => f2.targetCount - f1.targetCount);
    files = files.slice(0, 20);
    title = (
      <h5>
        Source changes: {sourceCount} in range {humanizeDate(couplingStart)} to
        {humanizeDate(couplingEnd)}
      </h5>
    );
    couplingDetails = (
      <table>
        <thead>
          <tr>
            <td>File</td>
            <td>Matching changes</td>
            <td>Ratio</td>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const ratio = file.targetCount / file.sourceCount;
            return (
              <tr key={file.targetFile}>
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
