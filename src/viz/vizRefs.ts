// The mutable handles `Viz.tsx` and `cameraWiring.ts` both work through.
//
// Its own module because it is the one type they share: `Viz.tsx` owns the React component that
// creates the refs, `cameraWiring.ts` owns everything that fits, zooms and resizes against them,
// and neither should have to import the other to name the bundle.

import { HierarchyNode } from "d3";
import { RefObject } from "react";

import { TreeNode } from "../polyglot_data.types";
import { Camera } from "../webgl/camera";
import { GlRenderer } from "../webgl/GlRenderer";

// Bundled rather than passed one by one: they are all set imperatively outside React's render
// cycle (CLAUDE.md: `react-hooks/refs` is off repo-wide for exactly this reason), and every one of
// them is needed by both `draw()` and `update()`.
export interface VizRefs {
  overlaySvg: RefObject<SVGSVGElement | null>;
  glCanvas: RefObject<HTMLCanvasElement | null>;
  chartStack: RefObject<HTMLDivElement | null>;
  camera: RefObject<Camera | null>;
  glRenderer: RefObject<GlRenderer | null>;
  // The fill/cell set, also what the picking index is built from.
  visibleNodes: RefObject<HierarchyNode<TreeNode>[] | null>;
  // A strict superset of visibleNodes - outlines are one per node, unioning what used to be two
  // overlapping SVG layers.
  outlineNodes: RefObject<HierarchyNode<TreeNode>[] | null>;
}
