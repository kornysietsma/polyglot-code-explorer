import React from "react";

import { Action, FileChangeMetric, State } from "../state";
import HelpPanel from "./HelpPanel";

export const FileChangeMetricChooser = ({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) => {
  return (
    <div>
      <label>Metric for comparing users/teams:</label>
      <select
        value={state.config.fileChangeMetric}
        onChange={(event) =>
          dispatch({
            type: "setFileChangeMetric",
            payload: event.target.value as FileChangeMetric,
          })
        }
      >
        <option key="lines" value="lines">
          Lines of code
        </option>
        <option key="commits" value="commits">
          File commits
        </option>
        <option key="files" value="files">
          Files changed
        </option>
        <option key="days" value="days">
          Days containing a change
        </option>
      </select>
      <HelpPanel buttonText="metric help">
        <p>
          This metric is used anywhere we show &ldquo;top&rdquo; users or teams,
          both in inspectors and in the Teams visualisations.
        </p>
        <p>The metrics are as follows:</p>
        <dl>
          <dt>Lines of code</dt>
          <dd>This is the total lines changed - added or removed</dd>
          <dt>File commits</dt>
          <dd>
            This is the individual file commits made. Note that 1 commit to 10
            files counts as a value of 10 for this - we don&apos;t currently
            have the data to identify a commit across multiple files.
          </dd>
          <dt>Files changed</dt>
          <dd>
            Number of files changed by this user/team - will always be 1 for a
            single file! Only really useful when looking at directories.
          </dd>
          <dt>Days with a change</dt>
          <dd>
            The number of days that a user made changes. Note this <i>does</i>{" "}
            work across multiple files, so 10 files changed on the same day have
            a value of 1.
          </dd>
        </dl>
      </HelpPanel>
    </div>
  );
};
