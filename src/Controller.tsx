import _ from "lodash";
import { useId, useMemo } from "react";

import { DefaultProps } from "./components.types";
import CouplingController from "./CouplingController";
import { humanizeDate } from "./datetimes";
import HelpPanel from "./HelpPanel";
import ToggleablePanel from "./ToggleablePanel";
import UsersAndTeams from "./UsersAndTeams";
import VisColourKey from "./VisColourKey";
import {
  isParentVisualization,
  VisualizationData,
  Visualizations,
} from "./VisualizationData";

const Controller = (props: DefaultProps) => {
  const { dataRef, state, dispatch } = props;
  const { metadata } = dataRef.current;
  const { maxDepth } = metadata.stats;
  const { config } = state;
  const { currentTheme } = config.colours;
  const { earliest, latest } = state.config.dateRange;
  // updated ID logic: https://stackoverflow.com/questions/29420835/how-to-generate-unique-ids-for-form-labels-in-react/71681435#71681435
  const vizId = useId();
  const depthId = useId();
  const subVizId = useId();
  const codeServerId = useId();
  const codeServerPrefixId = useId();
  const ownersThresholdId = useId();
  const ownersLinesNotCommitsId = useId();
  const remoteUrlTemplateId = useId();

  const sortedVis = Object.entries(Visualizations).sort(
    ([, v1], [, v2]) => v2.displayOrder - v1.displayOrder
  );
  const currentParentVisData = Visualizations[state.config.visualization];
  const currentVisOrSub: VisualizationData = isParentVisualization(
    currentParentVisData
  )
    ? currentParentVisData.children[
        state.config.subVis ?? currentParentVisData.defaultChild
      ]
    : currentParentVisData;

  const sortedSubVis = isParentVisualization(currentParentVisData)
    ? Object.entries(currentParentVisData.children).sort(
        ([, v1], [, v2]) => v2.displayOrder - v1.displayOrder
      )
    : undefined;

  const debouncedDispatch = useMemo(
    () => _.debounce((nextValue) => dispatch(nextValue), 250),
    [dispatch] // will be created only once
  );

  // TODO: move owners stuff into a component (I'm trying to get this out in a rush!)
  const ownersConfigPanel =
    state.config.visualization === "owners" ? (
      <div>
        <p>Experimental feature - may be slow!</p>
        <div>
          <label htmlFor={ownersThresholdId}>
            Threshold:&nbsp;
            {config.owners.threshold}%
            <input
              id={ownersThresholdId}
              type="range"
              min="1"
              max="100"
              value={config.owners.threshold}
              onChange={(evt) => {
                const value = parseInt(evt.target.value, 10);
                debouncedDispatch({
                  type: "setOwnersTheshold",
                  payload: value,
                });
              }}
              step="1"
            />
          </label>
        </div>
        <div>
          <label htmlFor={ownersLinesNotCommitsId}>
            Order by:&nbsp;
            <select
              id={ownersLinesNotCommitsId}
              value={config.owners.linesNotCommits.toString()}
              onChange={(evt) =>
                dispatch({
                  type: "setOwnerLinesNotCommits",
                  payload: evt.target.value === "true",
                })
              }
            >
              <option value="false">Commits</option>
              <option value="true">Lines</option>
            </select>
          </label>
        </div>
      </div>
    ) : (
      ""
    );

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
          <UsersAndTeams dataRef={dataRef} state={state} dispatch={dispatch} />
          <label htmlFor={depthId}>
            Display maximum depth:
            <select
              id={depthId}
              value={state.expensiveConfig.depth}
              onChange={(evt) =>
                debouncedDispatch({
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
        <div>
          <label htmlFor={remoteUrlTemplateId}>
            Remote url template:&nbsp;
            <input
              type="text"
              id={codeServerPrefixId}
              value={state.config.remoteUrlTemplate}
              onChange={(evt) =>
                dispatch({
                  type: "setRemoteUrlTemplate",
                  payload: evt.target.value,
                })
              }
            />
            <HelpPanel>
              <p>
                Enter a templated URL for browsing files online, similar to:
                &ldquo;
                {"https://{host}/{path}/{project}/blob/{ref}/{file}"}&rdquo;
                (which is the default, for github)
              </p>
              <p>
                Elements are bits of a remote URL - given an example{" "}
                <pre>git@github.com:foocorp/blah/bat.git</pre> you can map:
                <ul>
                  <li>host - the host name e.g. github.com</li>
                  <li>
                    path - the url prefix to the actual project name, e.g.
                    &apos;foocorp/blah
                  </li>
                  <li>
                    project - the last bit of the URL, e.g &apos;bat&apos;
                    (excluding .git)
                  </li>
                  <li>
                    ref - the name or git hash of the HEAD when the code was
                    scanned - usually a hex string
                  </li>
                  <li>
                    file - the path within the project of the file you are
                    browsing, e.g. &apos;src/main/baz.clj
                  </li>
                </ul>
              </p>
              <p>
                You can skip any element - if you want to see &apos;master&apos;
                use &apos;master&apos; in the template, instead of the ref.
              </p>
            </HelpPanel>
          </label>
        </div>
        <CouplingController
          dispatch={dispatch}
          state={state}
          metadata={metadata}
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
              <option key={key} value={key}>
                {vis.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isParentVisualization(currentParentVisData) ? (
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
              {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                sortedSubVis!.map(([key, vis]) => (
                  <option key={key} value={key}>
                    {vis.title}
                  </option>
                ))
              }
            </select>
          </label>
        </div>
      ) : (
        ""
      )}
      {ownersConfigPanel}
      <VisColourKey vis={currentVisOrSub} state={state} metadata={metadata} />
      {themeButton}
    </aside>
  );
};

export default Controller;
