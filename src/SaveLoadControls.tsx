import React, { useId, useState } from "react";

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
  const hiddenFileInput = React.useRef<HTMLInputElement>(null);

  const savedKeys = new Set(Object.keys(localStorage));
  const previousSaveExists = savedKeys.has(currentId);

  function saveToBrowser() {
    const exportable = stateToExportable(files, state, metadata);
    const json = exportableStateToJson(exportable);
    localStorage.setItem(currentId, json);
  }
  function saveToFile() {
    const exportable = stateToExportable(files, state, metadata);
    const json = exportableStateToJson(exportable);
    const file = new Blob([json], {
      type: "application/json",
    });
    const tempElement = document.createElement("a");
    tempElement.href = URL.createObjectURL(file);
    tempElement.download = "userData.json";
    document.body.appendChild(tempElement);
    tempElement.click();
    tempElement.parentNode?.removeChild(tempElement);
  }

  function parseAndLoadImportedJson(imported: string) {
    const importedState = jsonToExportableState(imported);
    const { state, messages } = stateFromExportable(
      metadata,
      importedState,
      tolerant
    );
    if (state !== undefined) {
      if (messages !== undefined && messages.length > 0) {
        state.messages.push(warnMessage("Errors were found and ignored."));
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
  }

  function loadFromBrowser() {
    try {
      const imported = localStorage.getItem(currentId);
      if (!imported) {
        throw new Error(
          `Error - tried importing id ${currentId} but no data found`
        );
      }
      parseAndLoadImportedJson(imported);
    } catch (e) {
      dispatch({
        type: "addMessage",
        payload: errorMessage(`${e}`),
      });
    }
  }

  function importFromJson(files: FileList | null) {
    try {
      if (files == null) {
        throw new Error("No file passed to import");
      }
      const file = files[0]!;
      const fileReader = new FileReader();
      fileReader.readAsText(file);
      fileReader.onload = (e) => {
        try {
          if (e.target && typeof e.target?.result == "string") {
            parseAndLoadImportedJson(e.target.result);
          } else {
            throw new Error("invalid upload result type");
          }
        } catch (e) {
          dispatch({
            type: "addMessage",
            payload: errorMessage(`${e}`),
          });
        }
      };
    } catch (e) {
      dispatch({
        type: "addMessage",
        payload: errorMessage(`${e}`),
      });
    }
  }

  return (
    <div>
      <div className="buttonList">
        <button onClick={saveToBrowser}>
          Save to browser
          {previousSaveExists ? " (overwrite)" : null}
        </button>
        <button onClick={saveToFile}>Save to file</button>
        {previousSaveExists ? (
          <button onClick={loadFromBrowser}>Load from browser</button>
        ) : null}
        <button
          onClick={() => {
            hiddenFileInput.current?.click();
          }}
        >
          Load from file
        </button>
        <input
          type="file"
          ref={hiddenFileInput}
          name="file"
          style={{ display: "none" }}
          onClick={() => {
            // without this you can't load the same named file twice as onChange doesn't fire!
            hiddenFileInput.current!.value = "";
          }}
          onChange={(event) => {
            importFromJson(event.target?.files);
          }}
        ></input>
      </div>
      <label htmlFor={tolerantCheckId}>
        Ignore non-fatal import errors:&nbsp;
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
