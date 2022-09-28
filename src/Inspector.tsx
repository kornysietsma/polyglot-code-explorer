import { DefaultProps } from "./components.types";
import DirectoryNodeInspector from "./DirectoryNodeInspector";
import NodeInspector from "./NodeInspector";
import { isDirectory } from "./polyglot_data.types";
import { errorMessage } from "./state";

const Inspector = (props: DefaultProps) => {
  const { state, dispatch, dataRef } = props;
  const {
    metadata,
    data: { features },
  } = dataRef.current;
  const { selectedNode: selectedNodePath } = state.config;

  const selectedNode = metadata.nodesByPath.get(selectedNodePath);
  if (!selectedNode) {
    dispatch({
      type: "addMessage",
      payload: errorMessage(`Invalid node selected ${selectedNodePath}`),
    });
    dispatch({
      type: "selectNode",
      payload: "",
    });
    throw new Error("bad selected node");
  }
  const nodeInspector = isDirectory(selectedNode) ? (
    <DirectoryNodeInspector
      node={selectedNode}
      state={state}
      metadata={metadata}
      features={features}
      dispatch={dispatch}
    />
  ) : (
    <NodeInspector
      node={selectedNode}
      state={state}
      metadata={metadata}
      features={features}
      dispatch={dispatch}
    />
  );
  return <aside className="Inspector">{nodeInspector}</aside>;
};

export default Inspector;
