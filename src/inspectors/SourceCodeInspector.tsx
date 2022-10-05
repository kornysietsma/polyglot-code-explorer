import "./SourceCodeInspector.css";

import { useEffect, useState } from "react";

import { nodePath } from "../nodeData";
import { FileNode } from "../polyglot_data.types";
import { State } from "../state";
import ToggleablePanel from "../widgets/ToggleablePanel";

const SourceCodePanel = ({ node, state }: { node: FileNode; state: State }) => {
  const {
    config: {
      codeInspector: { prefix },
    },
  } = state;

  const [code, setCode] = useState<string>();

  const path = nodePath(node);
  const url = `${prefix}${path}`;

  useEffect(() => {
    async function fetchData() {
      console.log(`fetching ${path} from ${url}`);
      // TODO UPGRADE - check error handling
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
        if (
          ex instanceof Error &&
          (ex.message.startsWith("NetworkError") ||
            ex.message.includes("Failed to fetch"))
        ) {
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
    <pre className="SourceCodeInspector">
      <code>{code}</code>
    </pre>
  ) : (
    <p>loading</p>
  );
};

const SourceCodeInspector = ({
  node,
  state,
}: {
  node: FileNode;
  state: State;
}) => {
  const { enabled } = state.config.codeInspector;

  return enabled ? (
    <ToggleablePanel title="Code" showInitially={false}>
      <SourceCodePanel node={node} state={state} />
    </ToggleablePanel>
  ) : null;
};

export default SourceCodeInspector;
