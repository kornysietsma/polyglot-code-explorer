import ColourKey from "./ColourKey";
import { humanizeDate } from "./datetimes";
import HelpPanel from "./HelpPanel";
import { FeatureFlags } from "./polyglot_data.types";
import { Action, State } from "./state";
import ToggleablePanel from "./ToggleablePanel";
import { VisualizationData } from "./VisualizationData";
import { VizMetadata } from "./viz.types";

const VisControlPanel = ({
  vis,
  state,
  metadata,
  features,
  dispatch,
}: {
  vis: VisualizationData;
  state: State;
  metadata: VizMetadata;
  features: FeatureFlags;
  dispatch: React.Dispatch<Action>;
}) => {
  const { earliest, latest } = state.config.filters.dateRange;
  const earliestDate = humanizeDate(earliest);
  const latestDate = humanizeDate(latest);
  const visualization = vis.buildVisualization(
    state,
    metadata,
    features,
    dispatch
  );
  const keyData = visualization.colourKey();
  const extraControls = visualization.extraControls();
  return (
    <div>
      {extraControls}
      <HelpPanel>{vis.help}</HelpPanel>
      <p>
        From: {earliestDate} to {latestDate}
      </p>
      <ToggleablePanel title="Colour Key" showInitially>
        <ColourKey title="" keyData={keyData} />
      </ToggleablePanel>
    </div>
  );
};

export default VisControlPanel;
