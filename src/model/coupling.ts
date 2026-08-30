// Temporal coupling: which other files change at the same time as this one. The scanner records
// it per file as counts bucketed by date, so everything here reads a node's own buckets and the
// UI's date range; `couplingBuckets.ts` holds the global bucket arithmetic that goes with it.

import {
  FileNode,
  isDirectory,
  isFile,
  TreeNode,
} from "../polyglot_data.types";

function nodeCouplingData(node: FileNode) {
  return node.data.coupling;
}

export function nodeHasCouplingData(node: TreeNode) {
  return isFile(node) && nodeCouplingData(node) !== undefined;
}

export type CouplingLink = {
  source: TreeNode;
  targetFile: string;
  sourceCount: number;
  targetCount: number;
};

function nodeCouplingFiles(
  node: TreeNode,
  earliest: number,
  latest: number
): CouplingLink[] | undefined {
  if (isDirectory(node)) {
    return undefined;
  }
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
  const files: Map<string, number> = new Map();
  buckets.forEach((bucket) => {
    totalBursts += bucket.activity_bursts;
    bucket.coupled_files.forEach(([filename, count]) => {
      files.set(filename, (files.get(filename) ?? 0) + count);
    });
  });
  // convert to array so vis.js can render each coupling line
  return [...files].map(([file, count]) => {
    return {
      source: node,
      targetFile: file,
      sourceCount: totalBursts,
      targetCount: count,
    };
  });
}

// How many leading path segments two files share - so "a/b/x.js" and "a/b/y.js" have 2.
function commonRoots(file1: string, file2: string): number {
  const f1bits = file1.split("/");
  const f2bits = file2.split("/");
  const maxLength = Math.min(f1bits.length, f2bits.length);
  let commonLength = 0;
  while (
    commonLength < maxLength &&
    f1bits[commonLength] === f2bits[commonLength]
  ) {
    commonLength += 1;
  }
  return commonLength;
}

/**
 * The Coupling controls' "filter coupling by distance": keeps only pairs of files that are at
 * most `maxCommonRoots` directories apart, so you can hide the coupling within a single
 * directory and see only the links that cross the codebase. A negative value means no filter.
 */
export function filesHaveMaxCommonRoots(
  maxCommonRoots: number,
  file1: string,
  file2: string
): boolean {
  if (maxCommonRoots < 0) return true;
  return commonRoots(file1, file2) <= maxCommonRoots;
}

export function nodeCouplingFilesFiltered(
  node: TreeNode,
  earliest: number,
  latest: number,
  minRatio: number,
  minBursts: number,
  maxCommonRoots: number
) {
  const files = nodeCouplingFiles(node, earliest, latest);
  if (files === undefined || files.length === 0) return files;
  return files.filter((f) => {
    return (
      f.sourceCount >= minBursts &&
      f.targetCount / f.sourceCount > minRatio &&
      filesHaveMaxCommonRoots(maxCommonRoots, f.source.path, f.targetFile)
    );
  });
}
