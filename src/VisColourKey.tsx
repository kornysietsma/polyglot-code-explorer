/* eslint-disable react/forbid-prop-types */

import React from "react";
import defaultPropTypes from "./defaultPropTypes";
import ToggleablePanel from "./ToggleablePanel";
import HelpPanel from "./HelpPanel";
import { humanizeDate } from "./datetimes";
import ColourKey from "./ColourKey";

const VisColourKey = (props) => {
  const { vis, state, metadata } = props;
  const { config } = state;
  const earliestDate = humanizeDate(config.dateRange.earliest);
  const latestDate = humanizeDate(config.dateRange.latest);
  const keyData = vis.colourKeyBuilder(vis, state, metadata);
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
VisColourKey.propTypes = defaultPropTypes;
export default VisColourKey;
