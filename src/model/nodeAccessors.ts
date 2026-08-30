// Small readers over a `TreeNode`: loc and language, creation dates, indentation, the layout
// centre, descendants. Deliberately not an abstraction barrier over the JSON shape - several
// modules read `node.data.*` directly - so a function belongs here when its name reads better
// than the field path it stands for, and not otherwise.

import {
  DirectoryNode,
  FeatureFlags,
  FileNode,
  IndentationData,
  isDirectory,
  LocData,
  TreeNode,
} from "../polyglot_data.types";

function addDescendants(nodes: TreeNode[], node: TreeNode): void {
  nodes.push(node);
  if (isDirectory(node)) {
    node.children.forEach((child) => addDescendants(nodes, child));
  }
}
// like d3.descendants but for tree nodes
export function nodeDescendants(node: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  if (isDirectory(node)) {
    node.children.forEach((child) => addDescendants(nodes, child));
  }
  return nodes;
}

export function nodeLocData(node: FileNode): LocData {
  return node.data.loc;
}

export function nodeLanguage(node: FileNode): string {
  const loc = nodeLocData(node);
  return loc.language;
}

export function nodeLinesOfCode(node: FileNode): number {
  return node.data.loc.code;
}

export function nodeCumulativeLinesOfCode(node: TreeNode): number {
  return node.value;
}

// count of strict ancestors whose layout.algorithm is a circle type - see NodeLayoutAlgorithm
export function nodeCircleAncestors(node: TreeNode): number {
  if (node.circleAncestors == undefined) {
    // defaulting to 0 here would silently reproduce the pre-fix behaviour for nestedCircles
    // files - wrong nesting depths rather than an obvious failure
    throw new Error(
      `Logic error: circleAncestors missing on ${node.path} - linkParents did not run`
    );
  }
  return node.circleAncestors;
}

export function nodeCreationDate(
  node: FileNode,
  features: FeatureFlags
): number | undefined {
  if (features.git) {
    return node.data.git?.creation_date;
  } else if (features.file_stats) {
    return node.data.file_stats?.created;
  } else {
    throw new Error("Must have git or file_stats feature enabled");
  }
}

export function nodeCreationDateClipped(
  node: FileNode,
  features: FeatureFlags,
  earliest: number,
  latest: number
): number | undefined {
  const creationDate = nodeCreationDate(node, features);
  if (!creationDate) return undefined;
  if (creationDate > latest) return undefined;
  if (creationDate < earliest) return undefined;
  return creationDate;
}

export function nodeRemoteUrl(node: DirectoryNode): string | undefined {
  return node.data?.git?.remote_url;
}

export function nodeRemoteHead(node: DirectoryNode): string | undefined {
  return node.data?.git?.head;
}

export function nodeIndentationData(
  node: FileNode
): IndentationData | undefined {
  return node.data.indentation;
}

export function nodeIndentation(
  node: FileNode,
  metric: "sum" | "p99" | "stddev"
) {
  if (!node.data.indentation) return undefined;
  return node.data.indentation[metric];
}

function nodeLayoutData(node: TreeNode) {
  if (isDirectory(node)) {
    return undefined;
  }
  return node.layout;
}

export function nodeCenter(node: TreeNode) {
  return nodeLayoutData(node)?.center;
}
