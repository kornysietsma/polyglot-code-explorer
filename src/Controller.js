/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
/* eslint-disable jsx-a11y/no-onchange */
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import GoodBadUglyKey from "./GoodBadUglyKey";
import DepthKey from "./DepthKey";
import ColourKey from "./ColourKey";
import { numberOfChangersScale } from "./ColourScales";
import { humanizeDate } from "./datetimes";

function buildNumberOfChangersKey(state) {
  const {
    config,
    config: { numberOfChangers }
  } = state;
  const scale = numberOfChangersScale(config);

  const key = [
    ["None", numberOfChangers.noChangersColour],
    ["One", numberOfChangers.oneChangerColour]
  ];
  for (
    let i = numberOfChangers.fewChangersMin;
    i < numberOfChangers.fewChangersMax;
    i += 1
  ) {
    key.push([i, scale(i)]);
  }
  const scaleIncrement =
    (numberOfChangers.manyChangersMax - numberOfChangers.fewChangersMax) / 10;
  for (
    let n = numberOfChangers.fewChangersMax;
    n <= numberOfChangers.manyChangersMax;
    n += scaleIncrement
  ) {
    key.push([Math.round(n), scale(n)]);
  }
  return key;
}

const Controller = props => {
  const { data, state, dispatch } = props;
  const {
    metadata: { languages }
  } = data.current;
  const { config, expensiveConfig, stats } = state;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));
  const { current: depthId } = useRef(_uniqueId("controller-"));
  const { current: indentMetricId } = useRef(_uniqueId("controller-"));
  const { current: churnMetricId } = useRef(_uniqueId("controller-"));
  const { languageKey, otherColour } = languages;
  const displayedLanguageKey = [
    ...languageKey.map(k => [k.language, k.colour]),
    ["Other languages", otherColour]
  ];
  const numberOfChangersKey = buildNumberOfChangersKey(state);

  const earliestDate = humanizeDate(config.dateRange.earliest);
  const latestDate = humanizeDate(config.dateRange.latest);

  function renderVizDetails(visualization) {
    switch (visualization) {
      case "language":
        return <ColourKey title="Languages" keyData={displayedLanguageKey} />;
      case "numberOfChangers":
        return (
          <div>
            <p>
              From: {earliestDate} to {latestDate}
            </p>
            <ColourKey
              title="Number of changers"
              keyData={numberOfChangersKey}
            />
          </div>
        );
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
      case "churn":
        return (
          <div>
            <p>
              From: {earliestDate} to {latestDate}
            </p>
            <GoodBadUglyKey
              title="Churn"
              visualization={visualization}
              config={config}
            />
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
            <option value="numberOfChangers">Number of changers</option>
            <option value="churn">Churn</option>
          </select>
        </label>
      </div>
      {state.config.visualization === "indentation" ? (
        <div>
          <label htmlFor={indentMetricId}>
            Indentation metric:
            <select
              id={indentMetricId}
              value={state.config.indentation.metric}
              onChange={evt =>
                dispatch({
                  type: "setIndentationMetric",
                  payload: evt.target.value
                })
              }
            >
              <option value="sum">Total area</option>
              <option value="p99">Worst indentation</option>
              <option value="stddev">Standard Deviation</option>
            </select>
          </label>
        </div>
      ) : (
        ""
      )}
      {state.config.visualization === "churn" ? (
        <div>
          <label htmlFor={churnMetricId}>
            Churn metric:
            <select
              id={churnMetricId}
              value={state.config.churn.metric}
              onChange={evt =>
                dispatch({
                  type: "setChurnMetric",
                  payload: evt.target.value
                })
              }
            >
              <option value="days">Days containing a change</option>
              <option value="commits">Commits per day</option>
              <option value="lines">Lines per day</option>
            </select>
          </label>
        </div>
      ) : (
        ""
      )}
      {renderVizDetails(state.config.visualization, languageKey)}
    </aside>
  );
};

export default Controller;
