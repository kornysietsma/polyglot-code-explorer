/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";

const Controller = props => {
  console.log("creating Controller");
  // console.log(props);
  const { data, state, dispatch } = props;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));
  const { current: depthId } = useRef(_uniqueId("controller-"));
  const { languageKey, otherColour } = data.current.languages;

  function renderVizDetails(visualization) {
    switch (visualization) {
      case "language":
        return (
          <div>
            <p>Languages:</p>
            <table>
              {languageKey.map(({ language, colour }) => {
                return (
                  <tr>
                    <td>{language}</td>
                    <td
                      className="colourSample"
                      style={{ backgroundColor: colour, width: "4em" }}
                    />
                  </tr>
                );
              })}
              <tr>
                <td>Other languages</td>
                <td
                  className="colourSample"
                  style={{ backgroundColor: otherColour, width: "4em" }}
                />
              </tr>
            </table>
          </div>
        );
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
