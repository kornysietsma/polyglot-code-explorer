import React from "react";
import PropTypes from "prop-types";

import ToggleablePanel from "./ToggleablePanel";

const HelpPanel = props => {
  const { children } = props;
  return (
    <ToggleablePanel
      title=""
      showInitially={false}
      showText="help"
      borderlessIfHidden
    >
      {children}
    </ToggleablePanel>
  );
};

HelpPanel.propTypes = {
  children: PropTypes.node.isRequired
};

export default HelpPanel;
