import React from "react";

import ToggleablePanel from "./ToggleablePanel";

const HelpPanel = ({ children }: { children: React.ReactNode }) => {
  return (
    <ToggleablePanel
      title=""
      showInitially={false}
      showText="help"
      borderlessIfHidden={true}
    >
      {children}
    </ToggleablePanel>
  );
};

export default HelpPanel;
