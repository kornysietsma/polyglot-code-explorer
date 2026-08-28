import { linkParents } from "./preprocess";
import {
  DirectoryNode,
  FileNode,
  NodeLayout,
  NodeLayoutAlgorithm,
  PolyglotData,
} from "./polyglot_data.types";

function layout(algorithm: NodeLayoutAlgorithm): NodeLayout {
  return { algorithm, center: [0, 0], polygon: [] };
}

function directory(
  name: string,
  algorithm: NodeLayoutAlgorithm,
  children: (DirectoryNode | FileNode)[]
): DirectoryNode {
  return {
    name,
    path: name,
    layout: layout(algorithm),
    value: 0,
    children,
  };
}

function file(name: string, algorithm: NodeLayoutAlgorithm): FileNode {
  return {
    name,
    path: name,
    layout: layout(algorithm),
    value: 0,
    data: {
      loc: {
        language: "test",
        binary: false,
        blanks: 0,
        code: 0,
        comments: 0,
        lines: 0,
        bytes: 0,
      },
    },
  };
}

describe("circleAncestors", () => {
  test("varies per branch under a nestedCircles root, per spec §3.2/§4", () => {
    // mirrors omf.json's shape: a nestedCircles root, one circlePack branch
    // ("nesteda") nested two deep, and one plain voronoi sibling branch.
    const nestedFile = file("nestedFile", "voronoi");
    const nesteda = directory("nesteda", "circlePack", [nestedFile]);
    const plainFile = file("plainFile", "voronoi");
    const plainBranch = directory("plain", "voronoi", [plainFile]);
    const root = directory("root", "nestedCircles", [nesteda, plainBranch]);

    const data = { tree: root } as PolyglotData;
    linkParents(data);

    expect(root.circleAncestors).toBe(0);
    expect(nesteda.circleAncestors).toBe(1);
    expect(nestedFile.circleAncestors).toBe(2);
    expect(plainBranch.circleAncestors).toBe(1);
    expect(plainFile.circleAncestors).toBe(1);
  });
});
