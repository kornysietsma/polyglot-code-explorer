import React from "react";

import {
  exportableTeamsAndAliasesToJson,
  jsonToStandaloneTeamsAndAliases,
} from "../exportImport";
import { errorMessage } from "../state";
import {
  ImportContext,
  pageStateFromImport,
  pageStateToExportData,
} from "./importExport";
import { PageStateProps } from "./pageState";

/**
 * The export and import buttons, and the file input behind them. Rendered as a fragment inside
 * the panel's own button list, between "cancel" and the stats controls.
 */
export const ImportExportControls = (
  props: PageStateProps & {
    /** names the downloaded file, so it is obvious which scan it came from */
    dataName: string;
    importContext: ImportContext;
  }
) => {
  const { pageState, setPageState, dataName, importContext } = props;

  const [tolerant, setTolerant] = React.useState(false);
  const tolerantCheckId = React.useId();
  const hiddenFileInput = React.useRef<HTMLInputElement>(null);

  function clearImportMessages() {
    setPageState({ ...pageState, importMessages: [] });
  }

  function addImportMessage(message: string) {
    setPageState({
      ...pageState,
      importMessages: [...pageState.importMessages, errorMessage(message)],
    });
  }

  function exportToJson() {
    const tempElement = document.createElement("a");
    const file = new Blob(
      [exportableTeamsAndAliasesToJson(pageStateToExportData(pageState))],
      { type: "application/json" }
    );
    tempElement.href = URL.createObjectURL(file);
    tempElement.download = `${dataName}_users.json`;
    document.body.appendChild(tempElement);
    tempElement.click();
    tempElement.parentNode?.removeChild(tempElement);
  }

  function importFromJson(files: FileList | null) {
    if (files == null) {
      addImportMessage("No file passed to import");
      return;
    }
    const file = files[0]!;
    const fileReader = new FileReader();
    fileReader.readAsText(file);
    fileReader.onload = (e) => {
      try {
        if (e.target && typeof e.target?.result == "string") {
          const value = jsonToStandaloneTeamsAndAliases(e.target.result);
          setPageState(
            pageStateFromImport(pageState, value, tolerant, importContext)
          );
        } else {
          addImportMessage("invalid upload result type");
        }
      } catch (e) {
        addImportMessage(`${e}`);
      }
    };
  }

  return (
    <>
      <button onClick={exportToJson}>export to JSON</button>
      <button
        onClick={() => {
          clearImportMessages();
          if (hiddenFileInput.current) {
            hiddenFileInput.current.click();
          }
        }}
      >
        import from JSON
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
    </>
  );
};

/** What the last import had to say, if anything. */
export const ImportMessages = (props: PageStateProps) => {
  const { pageState, setPageState } = props;

  if (pageState.importMessages.length == 0) return null;

  return (
    <div className="Messages">
      <h3>Import messages:</h3>
      <ul>
        {pageState.importMessages.map((message, ix) => (
          <li key={ix} className={message.severity}>
            {message.message}
          </li>
        ))}
      </ul>
      <button
        onClick={() => setPageState({ ...pageState, importMessages: [] })}
      >
        clear
      </button>
    </div>
  );
};
