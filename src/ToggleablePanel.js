import React from "react";
import styles from "./ToggleablePanel.module.css";

const ToggleablePanel = props => {
  const {
    showInitially,
    title,
    children,
    showText = "show",
    hideText = "hide",
    borderlessIfHidden = false
  } = props;
  console.log("ShowInitially:", showInitially);
  console.log("bih", borderlessIfHidden);
  const [showResults, setShowResults] = React.useState(showInitially);
  console.log("show results", showResults);
  const onClick = () => setShowResults(!showResults);
  const hiddenBorderStyle = borderlessIfHidden
    ? styles.panel_hidden_borderless
    : styles.panel_hidden;
  if (!showResults) {
    return (
      <div className={hiddenBorderStyle}>
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
    <div className={styles.panel_shown}>
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
