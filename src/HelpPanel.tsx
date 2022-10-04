import React from "react";

import ToggleablePanel from "./ToggleablePanel";

const HelpPanel = ({
  children,
  buttonText,
}: {
  children: React.ReactNode;
  buttonText?: string;
}) => {
  return (
    <ToggleablePanel
      title=""
      showInitially={false}
      showText={buttonText ?? "help"}
      borderlessIfHidden={true}
    >
      {children}
    </ToggleablePanel>
  );
};

export default HelpPanel;
