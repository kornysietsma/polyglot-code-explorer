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

export function nodePath(node) {
  return dataNode(node).path;
}
export function nodeName(node) {
  return dataNode(node).name;
}

function addDescendants(nodes, node) {
  nodes.push(node);
  if (node.children) {
    node.children.forEach((child) => addDescendants(nodes, child));
  }
}
// simulate d3.descendants but works for non-hierarchy nodes (so we don't need to build a hierarchy)
export function nodeDescendants(node) {
  if (isHierarchyNode(node)) {
    return node.descendants();
  }
  const nodes = [];
  node.children.forEach((child) => addDescendants(nodes, child));

  return nodes;
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
    (d) => d.commit_day >= earliest && d.commit_day <= latest
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
    users.forEach((user) => {
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

export function nodeTopChangersByLines(node, earliest, latest, maxPeople) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changerStats = new Map();
  // eslint-disable-next-line camelcase
  details.forEach(({ users, lines_added, lines_deleted }) => {
    // eslint-disable-next-line camelcase
    const totLines = lines_added + lines_deleted;
    users.forEach((user) => {
      if (!changerStats.has(user)) {
        changerStats.set(user, totLines);
      } else {
        changerStats.set(user, changerStats.get(user) + totLines);
      }
    });
  });

  return [...changerStats.entries()]
    .sort(([au, ac], [bu, bc]) => {
      return bc - ac;
    })
    .slice(0, maxPeople);
}

function setAsString(set) {
  // only works for sets of sortable things, needed as stupid es6 maps are broken with non-primitive keys
  return Array.from(set)
    .sort()
    .map((v) => `${v}`)
    .join("_");
}

export function nodeOwners(
  node,
  earliest,
  latest,
  thresholdPercent,
  linesNotCommits
) {
  const details = linesNotCommits
    ? nodeTopChangersByLines(node, earliest, latest, 9999)
    : nodeTopChangers(node, earliest, latest, 9999);

  if (!details) return undefined;

  if (details.length > 0) {
    const totalValue = _.sumBy(details, ([_user, value]) => value);
    // OK, want to say "we have total value, we want to aggregate users until we have over the threshold percentage of the total"
    const thresholdValue = (thresholdPercent / 100.0) * totalValue;
    const users = new Set();
    let aggregatedValue = 0.0;
    // eslint-disable-next-line no-restricted-syntax
    for (const [user, value] of details) {
      aggregatedValue += value;
      users.add(user);
      if (aggregatedValue > thresholdValue) {
        break;
      }
    }

    return { users: setAsString(users), value: aggregatedValue, totalValue };
  }
  return { users: "", value: 0, totalValue: 0 };
}

export function nodeOwnersNamesOnly(node, state) {
  const { config } = state;
  const { earliest, latest } = config.dateRange;
  const { thresholdPercent, linesNotCommits } = config.owners;
  const owners = nodeOwners(
    node,
    earliest,
    latest,
    thresholdPercent,
    linesNotCommits
  );
  return owners ? owners.users : undefined;
}

export function nodeNumberOfChangers(node, earliest, latest) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  const changers = _.uniq(details.flatMap((d) => d.users));
  return changers.length;
}

export function nodeChurnData(node, earliest, latest) {
  const details = nodeChangeDetails(node, earliest, latest);
  if (!details) return undefined;
  let totalLines = 0;
  let totalCommits = 0;
  const totalDays = details.length;
  details.forEach((d) => {
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
    fractionalDays: totalDays / duration,
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

export function nodeCouplingData(node) {
  const { data } = dataNode(node);

  if (!data || !data.coupling) return undefined;
  return data.coupling;
}

export function nodeHasCouplingData(node) {
  return nodeCouplingData(node) !== undefined;
}

export function nodeCouplingFiles(node, earliest, latest) {
  const couplingData = nodeCouplingData(node);
  if (!couplingData) return undefined;
  const buckets = couplingData.buckets.filter((bucket) => {
    if (bucket.bucket_start > latest) return false;
    if (bucket.bucket_end < earliest) return false;
    return true;
  });
  if (buckets.length === 0) {
    // nothing in current selection
    return [];
  }
  let totalBursts = 0;
  const files = {};
  buckets.forEach((bucket) => {
    totalBursts += bucket.activity_bursts;
    bucket.coupled_files.forEach(([filename, count]) => {
      if (files[filename] === undefined) {
        files[filename] = count;
      } else {
        files[filename] += count;
      }
    });
  });
  // convert to array so vis.js can render each coupling line
  return Object.entries(files).map(([file, count]) => {
    return {
      source: node,
      targetFile: file,
      sourceCount: totalBursts,
      targetCount: count,
    };
  });
}

function commonRoots(file1, file2) {
  const f1bits = file1.split("/");
  const f2bits = file2.split("/");
  let maxLength = f1bits.length;
  if (f2bits.length < maxLength) {
    maxLength = f2bits.length;
  }
  let commonLength = 0;
  let index = 0;
  while (f1bits[index] === f2bits[index]) {
    commonLength += 1;
    if (index >= maxLength) break;
    index += 1;
  }
  return commonLength;
}

function filesHaveMaxCommonRoots(maxCommonRoots, file1, file2) {
  if (maxCommonRoots < 0) return true;
  const common = commonRoots(file1, file2);
  return common <= maxCommonRoots;
}

export function nodeCouplingFilesFiltered(
  node,
  earliest,
  latest,
  minRatio,
  minBursts,
  maxCommonRoots
) {
  const files = nodeCouplingFiles(node, earliest, latest);
  if (files === undefined || files.length === 0) return files;
  return files.filter((f) => {
    return (
      f.sourceCount >= minBursts &&
      f.targetCount / f.sourceCount > minRatio &&
      filesHaveMaxCommonRoots(maxCommonRoots, nodePath(f.source), f.targetFile)
    );
  });
}

export function nodeLayoutData(node) {
  const theNode = dataNode(node); // not in nested 'data' part!

  if (!theNode || !theNode.layout) return undefined;
  return theNode.layout;
}

export function nodeCenter(node) {
  const layoutData = nodeLayoutData(node);
  if (!layoutData) return undefined;
  return layoutData.center;
}
