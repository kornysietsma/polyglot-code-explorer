import "./ToggleablePanel.css";

import React from "react";

const ToggleablePanel = ({
  showInitially,
  title,
  children,
  showText = "show",
  hideText = "hide",
  borderlessIfHidden = false,
  extraClass,
}: {
  showInitially: boolean;
  title: string;
  children: React.ReactNode;
  showText?: string;
  hideText?: string;
  borderlessIfHidden?: boolean;
  extraClass?: string;
}) => {
  const [showResults, setShowResults] = React.useState(showInitially);
  const onClick = () => setShowResults(!showResults);
  const hiddenBorderStyle = borderlessIfHidden ? "borderless" : "hidden";
  if (!showResults) {
    return (
      <div className={`ToggleablePanel ${hiddenBorderStyle}`}>
        <h4>
          {title}{" "}
          <button type="button" onClick={onClick}>
            {showText}
          </button>
        </h4>
      </div>
    );
  }
  return (
    <div className={`ToggleablePanel ${extraClass}`}>
      <h4>
        {title}{" "}
        <button type="button" onClick={onClick}>
          {hideText}
        </button>
      </h4>
      {children}
    </div>
  );
};

export default ToggleablePanel;
