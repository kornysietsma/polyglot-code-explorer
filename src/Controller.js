/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import GoodBadUglyKey from "./GoodBadUglyKey";
import DepthKey from "./DepthKey";
import ColourKey from "./ColourKey";

const Controller = props => {
  console.log("creating Controller");
  // console.log(props);
  const { data, state, dispatch } = props;
  const { config, stats } = state;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));
  const { current: depthId } = useRef(_uniqueId("controller-"));
  const { languageKey, otherColour } = data.current.languages;
  console.log("languageKey", languageKey)
  const displayedLanguageKey = [
    ...languageKey.map(k => [k.language, k.colour]),
    ["Other languages", otherColour]
  ];

  console.log("displayed", displayedLanguageKey)

  function renderVizDetails(visualization) {
    switch (visualization) {
      case "language":
        return <ColourKey title="Languages" keyData={displayedLanguageKey} />;
      case "loc":
        return (
          <GoodBadUglyKey
            title="Lines of Code"
            visualization={visualization}
            config={config}
          />
        );
      case "indentation":
        return (
          <GoodBadUglyKey
            title="Indentation"
            visualization={visualization}
            config={config}
          />
        );
      case "age":
        return (
          <GoodBadUglyKey
            title="Age of code (days)"
            visualization={visualization}
            config={config}
          />
        );
      case "depth":
        return <DepthKey config={config} stats={stats} />;
      default:
        return "";
    }
  }

  return (
    <aside className="Controller">
      <div>
        <label htmlFor={depthId}>
          Display maximum depth:
          <select
            id={depthId}
            value={state.expensiveConfig.depth}
            onChange={evt =>
              dispatch({
                type: "setDepth",
                payload: Number.parseInt(evt.target.value, 10)
              })
            }
          >
            {[...Array(state.stats.maxDepth + 1).keys()].map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label htmlFor={vizId}>
          Visualization:
          <select
            id={vizId}
            value={state.config.visualization}
            onChange={evt =>
              dispatch({ type: "setVisualization", payload: evt.target.value })
            }
          >
            <option value="language">Language</option>
            <option value="loc">Lines of Code</option>
            <option value="depth">Nesting depth</option>
            <option value="indentation">Indentation</option>
            <option value="age">Code age</option>
          </select>
        </label>
      </div>
      {renderVizDetails(state.config.visualization, languageKey)}
      {/*
      <div>
        Depth
        <input
          name="depth"
          type="range"
          value={state.expensiveConfig.depth}
          min="1"
          max="20"
          onChange={evt =>
            dispatch({
              type: "setDepth",
              payload: Number.parseInt(evt.target.value, 10)
            })
          }
        />
      </div>
      */}
    </aside>
  );
};

export default Controller;
