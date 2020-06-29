/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
/* eslint-disable jsx-a11y/no-onchange */
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import { numberOfChangersScale } from "./ColourScales";
import VisualizationData from "./visualizationData";
import VisColourKey from "./VisColourKey";

const Controller = props => {
  const { data, state, dispatch } = props;
  const { metadata } = data.current;
  const { config, expensiveConfig, stats } = state;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));
  const { current: depthId } = useRef(_uniqueId("controller-"));
  const { current: subVizId } = useRef(_uniqueId("controller-"));

  const sortedVis = Object.entries(VisualizationData).sort(
    ([k1, v1], [k2, v2]) => k2.displayOrder - k1.displayOrder
  );
  const currentParentVisData = VisualizationData[state.config.visualization];
  const currentSubVisData = currentParentVisData.subVis
    ? currentParentVisData.children[state.config.subVis]
    : undefined;
  const sortedSubVis = currentParentVisData.subVis
    ? Object.entries(currentParentVisData.children).sort(
        ([k1, v1], [k2, v2]) => k2.displayOrder - k1.displayOrder
      )
    : undefined;

  const currentVisOrSub = currentSubVisData || currentParentVisData;

  let churnControls = "";
  if (expensiveConfig.couplingAvailable) {
    if (expensiveConfig.coupling.shown) {
      churnControls = (
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "setShowCoupling",
              payload: false
            })
          }
        >
          Hide coupling
        </button>
      );
    } else {
      churnControls = (
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "setShowCoupling",
              payload: true
            })
          }
        >
          Show coupling
        </button>
      );
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
      {churnControls}
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
            {sortedVis.map(([key, vis]) => (
              <option value={key}>{vis.title}</option>
            ))}
          </select>
        </label>
      </div>
      {currentParentVisData.subVis ? (
        <div>
          <label htmlFor={subVizId}>
            Sub-visualisation:
            <select
              id={subVizId}
              value={state.config.subVis}
              onChange={evt =>
                dispatch({
                  type: "setSubVisualization",
                  payload: evt.target.value
                })
              }
            >
              {sortedSubVis.map(([key, vis]) => (
                <option value={key}>{vis.title}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        ""
      )}
      <VisColourKey
        vis={currentVisOrSub}
        config={config}
        metadata={metadata}
        stats={stats}
      />
    </aside>
  );
};

export default Controller;
