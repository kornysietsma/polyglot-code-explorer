import { useId, useState } from "react";

import { DefaultProps } from "./components.types";
import {
  exportableStateToJson,
  jsonToExportableState,
  stateFromExportable,
  stateToExportable,
} from "./exportImport";
import { errorMessage, infoMessage, warnMessage } from "./state";

const SaveLoadControls = (props: DefaultProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dataRef, state, dispatch } = props;
  const { files, metadata } = dataRef.current;
  const [tolerant, setTolerant] = useState<boolean>(false);
  const tolerantCheckId = useId();
  const currentId = files.id;

  const savedKeys = new Set(Object.keys(localStorage));
  const previousSaveExists = savedKeys.has(currentId);

  function saveToBrowser() {
    const exportable = stateToExportable(files, state, metadata);
    const json = exportableStateToJson(exportable);
    localStorage.setItem(currentId, json);
  }

  function loadFromBrowser() {
    try {
      const imported = localStorage.getItem(currentId);
      if (!imported) {
        throw new Error(
          `Error - tried importing id ${currentId} but no data found`
        );
      }
      const importedState = jsonToExportableState(imported);
      const { state, messages } = stateFromExportable(
        metadata,
        importedState,
        tolerant
      );
      if (state !== undefined) {
        if (messages !== undefined) {
          state.messages.push(
            warnMessage("Errors ignored - 'ignore errors' check selected")
          );
        }
        state.messages.push(infoMessage("Settings loaded."));

        dispatch({ type: "setAllState", payload: state });
      } else if (messages) {
        console.log("Import failed with messages");
        if (!tolerant) {
          messages.push(
            infoMessage(
              "You may be able to import by setting the 'ignore errors' import flag, but at your own risk!"
            )
          );
        }

        dispatch({ type: "addMessages", payload: messages });
      } else {
        throw new Error("Logic error  import failed with no messages");
      }
    } catch (e) {
      dispatch({
        type: "addMessage",
        payload: errorMessage(`Error: ${e}`),
      });
    }
  }

  return (
    <div>
      <div className="buttonList">
        <button onClick={saveToBrowser}>
          Save settings to browser
          {previousSaveExists ? " (overwrite)" : null}
        </button>
        {previousSaveExists ? (
          <button onClick={loadFromBrowser}>Load settings from browser</button>
        ) : null}
      </div>
      <label htmlFor={tolerantCheckId}>
        Ignore import errors:&nbsp;
        <input
          type="checkbox"
          id={tolerantCheckId}
          checked={tolerant}
          onChange={(evt) => {
            setTolerant(evt.target.checked);
          }}
        />
      </label>
    </div>
  );
};

export default SaveLoadControls;
