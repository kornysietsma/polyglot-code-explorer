import React, { useEffect, useState } from "react";
import defaultPropTypes from "./defaultPropTypes";
import styles from "./SourceCodeInspector.module.css";
import { nodePath } from "./nodeData";
import ToggleablePanel from "./ToggleablePanel";

const SourceCodePanel = (props) => {
  const { node, state } = props;
  const {
    config: {
      codeInspector: { prefix },
    },
  } = state;

  const [code, setCode] = useState();

  const path = nodePath(node);
  const url = `${prefix}${path}`;

  useEffect(() => {
    async function fetchData() {
      console.log(`fetching ${path} from ${url}`);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const text = `Error fetching URL ${url}\nHTTP response: ${response.status}:${response.statusText}`;
          setCode(text);
        } else {
          const text = await response.text();
          setCode(text);
        }
      } catch (ex) {
        console.error("Exception caught:", ex);
        if (ex.message.startsWith("NetworkError")) {
          setCode(
            `Network error talking to server\ntrying URL ${url}\nServer not found, or invalid CORS handling.`
          );
        } else {
          throw ex;
        }
      }
    }
    fetchData();
  }, [path, url]);

  return code ? (
    <pre className={styles.code}>
      <code>{code}</code>
    </pre>
  ) : (
    <p>loading</p>
  );
};

SourceCodePanel.propTypes = defaultPropTypes;

const SourceCodeInspector = (props) => {
  const { node, state, dispatch } = props;
  const { enabled } = state.config.codeInspector;

  return enabled ? (
    <ToggleablePanel title="Code" showInitially={false}>
      <SourceCodePanel node={node} state={state} dispatch={dispatch} />
    </ToggleablePanel>
  ) : (
    ""
  );
};

SourceCodeInspector.propTypes = defaultPropTypes;

export default SourceCodeInspector;
