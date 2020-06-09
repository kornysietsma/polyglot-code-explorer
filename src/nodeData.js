function nodeLoc(node) {
  if (!node.data) return undefined;
  const data = node.data.data || node.data; // cope with raw nodes or hierarchy nodes.

  if (!data || !data.loc) return undefined;
  return data.loc;
}

export { nodeLoc };
