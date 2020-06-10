import _ from "lodash";

/* Note most functions here work on both:
- a data node, the data from the raw JSON file, which is roughly
{
  data: metadata like lines of code
  children: optional list of children (only for directories)
  layout: pre-generated layout data
  name: filename/folder name
  path: full path from root
  value: pre-calculated lines of code (calculated in preprocessor, cumulative of all children)
  }

  - a hierarchy node, from d3 hierarchy magic, which has:
  {
    data: the dataNode above
    children: optional list of children (only for directories) but each child is a hierarchy node
    depth: depth from the rood
    height: height from leaves?
    parent: parent hierarchy node
    value: same as data.value, calculated cumulative size
   }

   We get hierarchy nodes from viz things, but in some cases (like caching initial data)
   we only have raw data.  For ease of reuse, functions here will detect the kind of node they have.
 */

export function isHierarchyNode(node) {
  return node.parent !== undefined; // parent is defined but null for the root node
}

export function isDirectory(node) {
  // both kinds of nodes have or don't have children!
  return node.children !== undefined && node.children !== null;
}

export function dataNode(node) {
  return isHierarchyNode(node) ? node.data : node;
}

export function nodeLocData(node) {
  const { data } = dataNode(node);

  if (!data || !data.loc) return undefined;
  return data.loc;
}

export function nodeLinesOfCode(node) {
  const loc = nodeLocData(node);
  if (!loc) return undefined;
  return loc.code;
}

export function nodeCumulativeLinesOfCode(node) {
  return dataNode(node).value;
}

export function nodeDepth(d) {
  if (!isHierarchyNode(d)) throw Error("Can't get depth for data node");
  return d.depth;
}

export function nodeAge(node) {
  const { data } = dataNode(node);
  if (!data || !data.git) return undefined;

  return data.git.age_in_days;
}

export function nodeIndentationData(node) {
  const { data } = dataNode(node);
  if (!data || !data.indentation) return undefined;
  return data.indentation;
}

export function nodeIndentation(node, metric) {
  const { data } = dataNode(node);
  if (!data || !data.indentation) return undefined;
  return data.indentation[metric];
}

// uses current metric from config
export function nodeIndentationFn(config) {
  return d => {
    return nodeIndentation(d, config.indentation.metric);
  };
}
