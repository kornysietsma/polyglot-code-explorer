/* eslint-disable react/prop-types */
import React from "react";
import ToggleablePanel from "./ToggleablePanel";
import HelpPanel from "./HelpPanel";
import { humanizeDate } from "./datetimes";
import ColourKey from "./ColourKey";

const VisColourKey = props => {
  const { vis, config, metadata } = props;
  const earliestDate = humanizeDate(config.dateRange.earliest);
  const latestDate = humanizeDate(config.dateRange.latest);
  const keyData = vis.colourKeyBuilder(vis, config, metadata);
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
