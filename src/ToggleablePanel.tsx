import React from "react";

import styles from "./ToggleablePanel.module.css";

const ToggleablePanel = ({
  showInitially,
  title,
  children,
  showText = "show",
  hideText = "hide",
  borderlessIfHidden = false,
}: {
  showInitially: boolean;
  title: string;
  children: React.ReactNode;
  showText?: string;
  hideText?: string;
  borderlessIfHidden?: boolean;
}) => {
  const [showResults, setShowResults] = React.useState(showInitially);
  const onClick = () => setShowResults(!showResults);
  const hiddenBorderStyle = borderlessIfHidden
    ? styles.borderless
    : styles.hidden;
  if (!showResults) {
    return (
      <div className={`${styles.panel} ${hiddenBorderStyle}`}>
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
    <div className={`${styles.panel}`}>
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
