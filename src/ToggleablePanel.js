/* eslint-disable react/prop-types */
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
    <div className={`${styles.panel} ${styles.shown}`}>
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
