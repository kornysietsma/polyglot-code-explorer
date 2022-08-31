import ColourKey from "./ColourKey";
import { humanizeDate } from "./datetimes";
import HelpPanel from "./HelpPanel";
import { State } from "./state";
import ToggleablePanel from "./ToggleablePanel";
import { VisualizationData } from "./VisualizationData";
import { VizMetadata } from "./viz.types";

const VisColourKey = ({
  vis,
  state,
  metadata,
}: {
  vis: VisualizationData;
  state: State;
  metadata: VizMetadata;
}) => {
  const { earliest, latest } = state.config.filters.dateRange;
  const earliestDate = humanizeDate(earliest);
  const latestDate = humanizeDate(latest);
  const keyData = vis.buildVisualization(state, metadata).colourKey();
  return (
    <div>
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

export default VisColourKey;
