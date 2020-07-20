/* eslint-disable jsx-a11y/no-onchange */
/* eslint-disable react/forbid-prop-types */
import React, { useRef } from "react";
import _uniqueId from "lodash/uniqueId";
import defaultPropTypes from "./defaultPropTypes";
import ToggleablePanel from "./ToggleablePanel";
import HelpPanel from "./HelpPanel";
import { couplingDateRange } from "./couplingBuckets";
import { humanizeDate } from "./datetimes";

const CouplingController = props => {
  const { dispatch, state, stats } = props;
  const {
    couplingConfig: {
      couplingAvailable,
      shown,
      minRatio,
      minDays,
      maxCommonRoots
    }
  } = state;
  const { current: sliderId } = useRef(_uniqueId("coupling-controller-"));
  const { current: minDaysId } = useRef(_uniqueId("coupling-controller-"));
  const { current: maxRootsId } = useRef(_uniqueId("coupling-controller-"));

  if (!couplingAvailable) {
    return (
      <div>
        <p>(no coupling data in source)</p>
      </div>
    );
  }

  const {
    coupling: { bucketCount, bucketSize, firstBucketStart }
  } = stats;
  const { earliest, latest } = state.config.dateRange;

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
          payload: false
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
          payload: true
        })
      }
    >
      Show coupling
    </button>
  );

  const minMinDays = 5;
  const maxMinDays = 30;

  return (
    <div>
      {showButton}
      <ToggleablePanel title="coupling controls" showInitially={false}>
        <HelpPanel>
          <p>
            Temporal coupling is based on git history - two files which
            regularly change on the same day, may well have some kind of
            coupling - explicit or implicit
          </p>
          <p>
            The current calculation is fairly simple:
            <br />
            For each file, find what days it has changed in git.
            <br />
            Then count any other file which changes on some of those days.
            <br />
            For example if foo.rs changes on 20 days, and bar.rs changes on 18
            of those days, it will show up as a coupling of 18/20 or 0.9.
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
            onChange={evt => {
              const value = Number.parseFloat(evt.target.value);

              dispatch({ type: "setMinCouplingRatio", payload: value });
            }}
          />
        </label>
        <label htmlFor={minDaysId}>
          Minimum days for coupling:
          <select
            name="minDays"
            id={minDaysId}
            value={minDays}
            onChange={evt =>
              dispatch({
                type: "setCouplingMinDays",
                payload: Number.parseInt(evt.target.value, 10)
              })
            }
          >
            {[...Array(maxMinDays - minMinDays + 1).keys()].map(d => {
              const days = minMinDays + d;
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
            onChange={evt =>
              dispatch({
                type: "setCouplingMaxCommonRoots",
                payload: Number.parseInt(evt.target.value, 10)
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

CouplingController.propTypes = defaultPropTypes;

export default CouplingController;
