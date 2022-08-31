import _uniqueId from "lodash/uniqueId";
import React, { useId } from "react";

import { couplingDateRange } from "./couplingBuckets";
import { humanizeDate } from "./datetimes";
import HelpPanel from "./HelpPanel";
import { Action, State } from "./state";
import ToggleablePanel from "./ToggleablePanel";
import { VizMetadata } from "./viz.types";

const CouplingController = (props: {
  state: State;
  metadata: VizMetadata;
  dispatch: React.Dispatch<Action>;
}) => {
  const { dispatch, state, metadata } = props;
  const { stats } = metadata;
  const {
    couplingConfig: {
      couplingAvailable,
      shown,
      minRatio,
      minBursts,
      maxCommonRoots,
    },
  } = state;
  const sliderId = useId();
  const minBurstsId = useId();
  const maxRootsId = useId();

  if (!couplingAvailable) {
    return (
      <div>
        <p>(no coupling data in source)</p>
      </div>
    );
  }

  if (stats.coupling === undefined) {
    throw new Error("No coupling config defined");
  }
  const {
    coupling: { bucketSize },
  } = stats;
  const { earliest, latest } = state.config.filters.dateRange;

  // TODO: debounce slider?  Tried using 'onInput' but 'onChange' fires on every change anyway

  const bucketDays = bucketSize / (24 * 60 * 60);

  const { couplingStart, couplingEnd } = couplingDateRange(
    stats.coupling,
    earliest,
    latest
  );

  const showButton = shown ? (
    <button
      type="button"
      onClick={() =>
        dispatch({
          type: "setShowCoupling",
          payload: false,
        })
      }
    >
      Hide coupling
    </button>
  ) : (
    <button
      type="button"
      onClick={() =>
        dispatch({
          type: "setShowCoupling",
          payload: true,
        })
      }
    >
      Show coupling
    </button>
  );

  const minMinBursts = 1;
  const maxMinBursts = 100;

  return (
    <div>
      <ToggleablePanel title="coupling controls" showInitially={false}>
        {showButton}
        <HelpPanel>
          <p>
            Temporal coupling is based on git history - two files which
            regularly change at the same time, may well have some kind of
            coupling - explicit or implicit.
          </p>
          <p>
            See{" "}
            <a href="https://polyglot.korny.info/metrics/temporal-coupling">
              the Docs site for more.
            </a>
          </p>
          <p>
            The current calculation uses some thresholds to work out what
            &ldquo;changed at the same time&rdquo; means:
            <br />
            For each file, find when it changed. This is done when scanning, and
            multiple commits in a short space of time to the same file are
            counted as a single &ldquo;activity burst&rdquo; - so if a file
            changed 10 times in a stretch, it counts as one activity. (by
            default a gap of 2 hours is needed to separate activities)
            <br />
            Then count any other file which changes near that burst of activity
            - by default, within an hour of the start or end.
            <br />
            For example if foo.rs changes regularly for 5 days in a week, and
            bar.rs changes within an hour of the foo.rs change on 4 days, then
            it will show up with a coupling of 4/5 or 0.8
            <br />
          </p>
          <p>
            This is a one-way relationship - foo.rs <i>may</i> have coupling
            that means if bar.rs changes, foo.rs also has to change. The inverse
            may not be true - bar.rs might change on 100 other days as well!
          </p>
          <p>
            Be aware this can easily have false positives! For example, if
            bar.rs is changed extremely regularly, it will look like a lot of
            other files are coupled to it! You should probably consider
            excluding bar.rs from your initial scan - it&apos;s probably not
            normal source code. (there is no way to ignore it in the explorer
            currently)
          </p>
          <p>Note there are some limits on coupling data stored, for sanity:</p>
          <p>
            Coupling is calculated in &ldquo;buckets&rdquo; of {bucketDays} days
            each, so you can see coupling change over time. If you have multiple
            buckets selected, the changes are averaged. Buckets will be shown on
            the timescale below soon!
          </p>
          <p>
            Coupling data is only stored for files with 10 changes in a coupling
            bucket (by default, this is configurable) - this means files with a
            low rate of change may not show coupling. This is hard to avoid,
            lowering this filter can lead to a lot of false positives.
          </p>
          <p>
            Coupling data is only stored if a ratio of 0.25 is observed (by
            default, this is configurable)
          </p>
        </HelpPanel>
        <p>
          Coupling date range {humanizeDate(couplingStart)} to{" "}
          {humanizeDate(couplingEnd)}
        </p>
        <label htmlFor={sliderId}>
          Coupling Ratio: &nbsp;
          {minRatio.toFixed(2)}
          <input
            id={sliderId}
            type="range"
            min="0.25"
            max="1.0"
            step="0.01"
            value={minRatio}
            onChange={(evt) => {
              const value = Number.parseFloat(evt.target.value);

              dispatch({ type: "setMinCouplingRatio", payload: value });
            }}
          />
        </label>
        <label htmlFor={minBurstsId}>
          Minimum activity bursts for coupling:
          <select
            name="minBursts"
            id={minBurstsId}
            value={minBursts}
            onChange={(evt) =>
              dispatch({
                type: "setCouplingMinBursts",
                payload: Number.parseInt(evt.target.value, 10),
              })
            }
          >
            {[...Array(maxMinBursts - minMinBursts + 1).keys()].map((d) => {
              const days = minMinBursts + d;
              return (
                <option key={days} value={days}>
                  {days}
                </option>
              );
            })}
          </select>
        </label>
        <label htmlFor={maxRootsId}>
          Filter coupling by distance:
          <select
            name="maxRoots"
            id={maxRootsId}
            value={maxCommonRoots}
            onChange={(evt) =>
              dispatch({
                type: "setCouplingMaxCommonRoots",
                payload: Number.parseInt(evt.target.value, 10),
              })
            }
          >
            <option key="-1" value="-1">
              No filter
            </option>
            <option key="0" value="0">
              top-level directories
            </option>
            <option key="1" value="1">
              0-1st level directories
            </option>
            <option key="2" value="2">
              0-2nd level directories
            </option>
            <option key="3" value="3">
              0-3rd level directories
            </option>
          </select>
        </label>
      </ToggleablePanel>
    </div>
  );
};

export default CouplingController;
