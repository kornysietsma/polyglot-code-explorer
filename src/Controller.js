/* eslint-disable react/prop-types */
// as prop-types seem painful to implement without going full typescript
/* eslint-disable jsx-a11y/no-onchange */
import React, { useState, useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import GoodBadUglyKey from "./GoodBadUglyKey";
import DepthKey from "./DepthKey";
import ColourKey from "./ColourKey";
import CreationKey from "./CreationKey";
import { numberOfChangersScale } from "./ColourScales";
import { humanizeDate } from "./datetimes";
import HelpPanel from "./HelpPanel";

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
        return (
          <div>
            <HelpPanel>
              <p>Shows the most used languages</p>
            </HelpPanel>
            <ColourKey title="Languages" keyData={displayedLanguageKey} />
          </div>
        );
      case "numberOfChangers":
        return (
          <div>
            <HelpPanel>
              <p>
                Shows unique changers in selected date range. Too few changers
                might indicate lack of shared understanding of code. Too many
                changers might indicate poorly designed code that has too many
                concerns and needs constant change.
              </p>
              <p>
                Note currently there is no way to tell if one user with multiple
                logins is not multiple people!
              </p>
            </HelpPanel>
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
          <div>
            <HelpPanel>
              <p>
                Large lines of code has been shown to be strongly correlated
                with complexity. Good code &ldquo;fits in your head&rdquo;.
              </p>
            </HelpPanel>
            <GoodBadUglyKey
              title="Lines of Code"
              visualization={visualization}
              config={config}
            />
          </div>
        );
      case "indentation":
        return (
          <div>
            <HelpPanel>
              <p>Code indentation can be correlated with complexity</p>
              <p>
                Standard Deviation is a good overall indicator, Total Area (sum
                of all indentations) also shows large complex files, Worst
                Indentation highlights files with individual spots of large
                indentation
              </p>
              <p>
                Note that inconsistent indentation (e.g. deep indenting which
                doesn&apos;t relate to code structure) or mixing of tabs/spaces
                can mess this up. Current code assumes tabs are 4 spaces.
              </p>
            </HelpPanel>
            <GoodBadUglyKey
              title="Indentation"
              visualization={visualization}
              config={config}
            />
          </div>
        );
      case "age":
        return (
          <div>
            <HelpPanel>
              <p>Highlights code which has had no changes for some time.</p>
              <p>
                This may indicate code which has not been touched or refactored
                in a long time, indicating lost knowledge
              </p>
              <p>It may also indicate code that is stable and bug-free</p>
              <p>
                The meaning may depend on development culture, and quality of
                tests
              </p>
            </HelpPanel>
            <p>
              From: {earliestDate} to {latestDate}
            </p>

            <GoodBadUglyKey
              title="Age of last change (days)"
              visualization={visualization}
              config={config}
            />
          </div>
        );
      case "creation":
        return (
          <div>
            <HelpPanel>
              <p>
                Creation date - only shows files created in the selected date
                range
              </p>
              <p>
                This isn't really related to quality, but is useful for
                visualizing code history
              </p>
              <p>
                Note that this is not a true historical view - the layout
                doesn't change with changing time scales, and deleted files
                aren't shown even if you select past dates.
              </p>
            </HelpPanel>
            <p>
              From: {earliestDate} to {latestDate}
            </p>

            <CreationKey config={config} state={state} />
          </div>
        );
      case "depth":
        return (
          <div>
            <HelpPanel>
              <p>Shows nesting depth in the directory tree</p>
            </HelpPanel>
            <DepthKey config={config} stats={stats} />
          </div>
        );
      case "churn":
        return (
          <div>
            <HelpPanel>
              <p>
                Code Churn shows how often the code has changed in the selected
                date range
              </p>
              <p>
                You can show the number of days that had any changes, the total
                number of changes, or the total lines changed (added + deleted)
              </p>
              <p>
                These values are divided by the number of days selected, so you
                can have meaningful comparisons of rates of change with other
                timescales
              </p>
            </HelpPanel>
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
            <option value="age">Age of last change</option>
            <option value="creation">Creation date</option>
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
