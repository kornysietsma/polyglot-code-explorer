import { HierarchyNode } from "d3";

export type Tree = {
  version: string;
  name: string;
  id: string;
  tree: TreeNode;
  metadata: {
    git?: {
      users: GitUser[];
    };
    coupling?: CouplingMetadata;
  };
};

type AbstractTreeNode = {
  name: string;
  path: string;
  layout: NodeLayout;
  value: number; //redundant, but useful until we have new layout code
  parent?: DirectoryNode; // populated after loading
};

export type TreeNode = DirectoryNode | FileNode;

export type DirectoryNode = AbstractTreeNode & {
  children: TreeNode[];
  data?: {
    git: GitRepoData;
  };
};

export type FileNode = AbstractTreeNode & {
  data: FileData;
};

export function isDirectory(node: TreeNode): node is DirectoryNode {
  return (node as DirectoryNode).children !== undefined;
}

export function isFile(node: TreeNode): node is FileNode {
  return (node as DirectoryNode).children == undefined;
}

export function isHierarchyDirectory(
  node: HierarchyNode<TreeNode>
): node is HierarchyNode<DirectoryNode> {
  return isDirectory(node.data);
}

export function isHierarchyFile(
  node: HierarchyNode<TreeNode>
): node is HierarchyNode<FileNode> {
  return isFile(node.data);
}

// Tree types
export type GitUser = {
  id: number;
  user: {
    name?: string;
    email?: string;
  };
};

export type CouplingMetadata = {
  buckets: {
    bucket_size: number;
    bucket_count: number;
    first_bucket_start: number;
  };
  config: {
    bucket_days: number;
    min_bursts: number;
    min_coupling_ratio: number;
    min_activity_gap: number;
    coupling_time_distance: number;
    min_distance: number;
    max_common_roots?: number;
  };
};

// TreeNode types

export type NodeLayout = {
  algorithm: string;
  center: Point;
  polygon: Point[];
  // width and height exist on directories not files! But that is beyond typescript
  width?: number;
  height?: number;
};

export type Point = [x: number, y: number];

// DirectoryNode types

export type GitRepoData = {
  remote_url?: string;
  head?: string;
};

// FileNode types

export type FileData = {
  indentation?: IndentationData;
  loc: LocData;
  git?: GitData;
  coupling?: CouplingData;
};

export type IndentationData = {
  lines: number;
  minimum: number;
  maximum: number;
  median: number;
  stddev: number;
  p75: number;
  p90: number;
  p99: number;
  sum: number;
};

export type LocData = {
  language: string;
  binary: boolean;
  blanks: number;
  code: number;
  comments: number;
  lines: number;
  bytes: number;
};

export type GitData = {
  last_update: number;
  age_in_days: number;
  creation_date?: number;
  user_count: number;
  users: number[];
  details: GitDetails[];
};

export type GitDetails = {
  commit_day: number;
  users: number[];
  commits: number;
  lines_added: number;
  lines_deleted: number;
};

export type CouplingData = {
  buckets: CouplingBucket[];
};
export type CouplingBucket = {
  activity_bursts: number;
  bucket_start: number;
  bucket_end: number;
  coupled_files: CoupledFile[];
};
export type CoupledFile = [string, number];
