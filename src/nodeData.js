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

export function nodeLanguage(node) {
  const loc = nodeLocData(node);
  if (!loc) return undefined;
  return loc.language;
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

export function nodeGitData(node) {
  const { data } = dataNode(node);

  if (!data || !data.git) return undefined;
  return data.git;
}

export function nodeCreationDate(node) {
  const git = nodeGitData(node);
  if (!git) return undefined;

  return git.creation_date;
}

export function nodeCreationDateClipped(node, earliest, latest) {
  const creationDate = nodeCreationDate(node);
  if (!creationDate) return undefined;
  if (creationDate > latest) return undefined;
  if (creationDate < earliest) return undefined;
  return creationDate;
}

export function nodeRemoteUrl(node) {
  const git = nodeGitData(node);
  if (!git) return undefined;

  return git.remote_url;
}

export function nodeRemoteHead(node) {
  const git = nodeGitData(node);
  if (!git) return undefined;

  return git.head;
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

export function nodeIndentationSum(node) {
  const { data } = dataNode(node);
  if (!data || !data.indentation) return undefined;
  return data.indentation.sum;
}

export function nodeIndentationP99(node) {
  const { data } = dataNode(node);
  if (!data || !data.indentation) return undefined;
  return data.indentation.p99;
}

export function nodeIndentationStddev(node) {
  const { data } = dataNode(node);
  if (!data || !data.indentation) return undefined;
  return data.indentation.stddev;
}

// Date range based data, mostly git details

function nodeChangeDetails(node, earliest, latest) {
  const git = nodeGitData(node);
  if (!git) return undefined;
  const { details } = git;
  if (!details) return undefined;
  if (earliest === undefined && latest === undefined) return details;
  return details.filter(
    d => d.commit_day >= earliest && d.commit_day <= latest
  );
}

export function nodeLastCommitDay(node, earliest, latest) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details || details.length === 0) return undefined; // TODO: distinguish no history from undefined!
  return details[details.length - 1].commit_day;
}

export function nodeAge(node, earliest, latest) {
  const lastCommit = nodeLastCommitDay(node, earliest, latest);
  if (!lastCommit) return undefined;
  return Math.ceil((latest - lastCommit) / (24 * 60 * 60));
}

export function nodeTopChangers(node, earliest, latest, maxPeople) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats = new Map();
  details.forEach(({ users, commits }) => {
    users.forEach(user => {
      if (!changerStats.has(user)) {
        changerStats.set(user, commits);
      } else {
        changerStats.set(user, changerStats.get(user) + commits);
      }
    });
  });

  return [...changerStats.entries()]
    .sort(([au, ac], [bu, bc]) => {
      return bc - ac;
    })
    .slice(0, maxPeople);
}

export function nodeNumberOfChangers(node, earliest, latest) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changers = _.uniq(details.flatMap(d => d.users));
  return changers.length;
}

export function nodeChurnData(node, earliest, latest) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  let totalLines = 0;
  let totalCommits = 0;
  const totalDays = details.length;
  details.forEach(d => {
    const changeSize = d.lines_added + d.lines_deleted;
    totalCommits += d.commits;
    totalLines += changeSize;
  });
  const duration = (latest - earliest) / (24 * 60 * 60);

  return {
    totalLines,
    totalCommits,
    totalDays,
    fractionalLines: totalLines / duration,
    fractionalCommits: totalCommits / duration,
    fractionalDays: totalDays / duration
  };
}


export function nodeChurnDays(node, earliest, latest) {
  const data = nodeChurnData(node, earliest, latest);
  if (!data) return undefined;
  return data.fractionalDays;
}

export function nodeChurnCommits(node, earliest, latest) {
  const data = nodeChurnData(node, earliest, latest);
  if (!data) return undefined;
  return data.fractionalCommits;
}

export function nodeChurnLines(node, earliest, latest) {
  const data = nodeChurnData(node, earliest, latest);
  if (!data) return undefined;
  return data.fractionalLines;
}
