/* eslint-disable jsx-a11y/no-onchange */
/* eslint-disable react/forbid-prop-types */
import React, { useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import defaultPropTypes from "./defaultPropTypes";
import VisualizationData from "./visualizationData";
import VisColourKey from "./VisColourKey";
import CouplingController from "./CouplingController";
import ToggleablePanel from "./ToggleablePanel";
import { humanizeDate } from "./datetimes";

const Controller = (props) => {
  const { dataRef, state, dispatch } = props;
  const { metadata } = dataRef.current;
  const { maxDepth } = metadata.stats;
  const { config } = state;
  const { currentTheme } = config.colours;
  const { earliest, latest } = state.config.dateRange;
  // ID logic from https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react
  const { current: vizId } = useRef(_uniqueId("controller-"));
  const { current: depthId } = useRef(_uniqueId("controller-"));
  const { current: subVizId } = useRef(_uniqueId("controller-"));
  const { current: codeServerId } = useRef(_uniqueId("controller-"));
  const { current: codeServerPrefixId } = useRef(_uniqueId("controller-"));

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

  const themeButton =
    currentTheme === "dark" ? (
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "setTheme",
            payload: "light",
          })
        }
      >
        Light theme
      </button>
    ) : (
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "setTheme",
            payload: "dark",
          })
        }
      >
        Dark theme
      </button>
    );

  return (
    <aside className="Controller">
      <p>
        Selected date range {humanizeDate(earliest)} to {humanizeDate(latest)}
      </p>
      <ToggleablePanel title="advanced settings" showInitially={false}>
        <div>
          <label htmlFor={depthId}>
            Display maximum depth:
            <select
              id={depthId}
              value={state.expensiveConfig.depth}
              onChange={(evt) =>
                dispatch({
                  type: "setDepth",
                  payload: Number.parseInt(evt.target.value, 10),
                })
              }
            >
              {[...Array(maxDepth + 1).keys()].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label htmlFor={codeServerId}>
            Code server available:&nbsp;
            <input
              type="checkbox"
              id={codeServerId}
              checked={state.config.codeInspector.enabled}
              onChange={(evt) => {
                console.log("chchange:", evt.target);
                dispatch({
                  type: "enableCodeServer",
                  payload: evt.target.checked,
                });
              }}
            />
          </label>
        </div>
        <div>
          <label htmlFor={codeServerPrefixId}>
            Code server prefix:&nbsp;
            <input
              type="text"
              id={codeServerPrefixId}
              value={state.config.codeInspector.prefix}
              onChange={(evt) =>
                dispatch({
                  type: "setCodeServerPrefix",
                  payload: evt.target.value,
                })
              }
            />
          </label>
        </div>
        <CouplingController
          dispatch={dispatch}
          state={state}
          stats={metadata.stats}
        />
      </ToggleablePanel>
      <div>
        <label htmlFor={vizId}>
          Visualization:
          <select
            id={vizId}
            value={state.config.visualization}
            onChange={(evt) =>
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
              onChange={(evt) =>
                dispatch({
                  type: "setSubVisualization",
                  payload: evt.target.value,
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
      <VisColourKey vis={currentVisOrSub} config={config} metadata={metadata} />
      {themeButton}
    </aside>
  );
};

Controller.propTypes = defaultPropTypes;

export default Controller;
