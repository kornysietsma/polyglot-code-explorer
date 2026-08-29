// Turns tree nodes into the typed arrays GlRenderer.ts uploads to the GPU. No `gl` import - the
// WebGL context itself is created and owned entirely by GlRenderer.ts (plan.md decision 6).

import { HierarchyNode } from "d3";

import { TreeNode } from "../polyglot_data.types";
import { parseCssColour } from "./colours";
import { assertConvex, fanTriangulate } from "./triangulate";

export interface FillGeometry {
  // flat [x0,y0, x1,y1, ...] world-space triangle-list vertices
  positions: Float32Array;
  // flat [r0,g0,b0, r1,g1,b1, ...] per-vertex colour in 0-1, one triple per position vertex
  colours: Float32Array;
}

// One triangle fan per node's polygon (spec.md, "Fills"): Voronoi cells and circle
// approximations are both convex, so the fan is an exact triangulation. `fillFn` must already be
// resolved to a real CSS colour string - `url(#patternN)` fallback resolution
// (colours.resolvePatternFallback) is the caller's job, not this module's, so this stays about
// geometry only.
export function buildFills(
  nodes: readonly HierarchyNode<TreeNode>[],
  fillFn: (d: HierarchyNode<TreeNode>) => string
): FillGeometry {
  const positionChunks: Float32Array[] = [];
  const colourChunks: Float32Array[] = [];
  let totalVertices = 0;

  for (const node of nodes) {
    const polygon = node.data.layout.polygon;
    assertConvex(polygon, node.data.path);
    const triangles = fanTriangulate(polygon);
    positionChunks.push(triangles);

    const vertexCount = triangles.length / 2;
    totalVertices += vertexCount;

    const [r, g, b] = parseCssColour(fillFn(node));
    const colours = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      colours[i * 3] = r;
      colours[i * 3 + 1] = g;
      colours[i * 3 + 2] = b;
    }
    colourChunks.push(colours);
  }

  return {
    positions: concatFloat32(positionChunks, totalVertices * 2),
    colours: concatFloat32(colourChunks, totalVertices * 3),
  };
}

function concatFloat32(
  chunks: readonly Float32Array[],
  totalLength: number
): Float32Array {
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
