// Turns tree nodes into the typed arrays GlRenderer.ts uploads to the GPU. No `gl` import - the
// WebGL context itself is created and owned entirely by GlRenderer.ts (plan.md decision 6).

import { HierarchyNode } from "d3";

import { nodeCircleAncestors } from "../nodeData";
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

export interface OutlineGeometry {
  // flat [x0,y0, x1,y1, ...] world-space vertices, 4 per edge
  positions: Float32Array;
  // flat [x0,y0, x1,y1, ...] signed offset direction, one pair per position vertex
  normals: Float32Array;
  // one level (0-4) per position vertex, read by the shader as an index into the
  // u_widths/u_strokeColours uniform arrays - this is what makes a nesting colour or width
  // edit a uniform update with no buffer re-upload (spec.md, "The three update paths")
  levels: Float32Array;
  // 6 per edge (two triangles covering the expanded quad), indexing into the arrays above
  indices: Uint32Array;
}

// spec.md, "Outlines": nodes closer to the root than their own circleAncestors count sit in the
// circle-packed region above where nesting strokes start; nodes deeper than the 4 configured
// nesting levels run out of distinct colours/widths. Both fall back to index 4, the shared
// defaultStroke/defaultWidth slot - matching, respectively, what the old `.cell` layer's
// unconditional default stroke and the old `redrawNesting`'s own length-overflow fallback did.
// Exported standalone (no HierarchyNode dependency) so it can be tested directly against the
// formula for depth 0..8 and circleAncestors 0..2, including the `omf.json` case where circle
// depth varies per branch (CLAUDE.md, "Circle-packed layouts and circleAncestors").
export function outlineLevel(depth: number, circleAncestors: number): number {
  const level = depth - (circleAncestors + 1);
  if (level < 0 || level >= 4) return 4;
  return level;
}

// One outline per node - the union of the old `.cell` and `.nesting` SVG layers (spec.md,
// "Outlines"), which is what removes the 19,101 SVG paths that duplicated an already-drawn cell
// border. `nodes` is the caller's job to assemble as that union (Viz.tsx's `outlineNodesRef`) and
// to sort depth-descending first, exactly like the old `.nesting` sort: painting is all fills
// then all outlines in buffer order with no depth test, so shallower/wider strokes have to come
// later in this list to land on top of deeper ones.
export function buildOutlines(
  nodes: readonly HierarchyNode<TreeNode>[]
): OutlineGeometry {
  let edgeCount = 0;
  for (const node of nodes) edgeCount += node.data.layout.polygon.length;

  const positions = new Float32Array(edgeCount * 4 * 2);
  const normals = new Float32Array(edgeCount * 4 * 2);
  const levels = new Float32Array(edgeCount * 4);
  const indices = new Uint32Array(edgeCount * 6);

  let vertex = 0;
  let posOffset = 0;
  let idxOffset = 0;

  const emitVertex = (
    x: number,
    y: number,
    nx: number,
    ny: number,
    level: number
  ) => {
    positions[posOffset] = x;
    positions[posOffset + 1] = y;
    normals[posOffset] = nx;
    normals[posOffset + 1] = ny;
    posOffset += 2;
    levels[vertex] = level;
    vertex++;
  };

  for (const node of nodes) {
    const polygon = node.data.layout.polygon;
    const level = outlineLevel(node.depth, nodeCircleAncestors(node.data));
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const [ax, ay] = polygon[i]!;
      const [bx, by] = polygon[(i + 1) % n]!;
      const dx = bx - ax;
      const dy = by - ay;
      // Guards a zero-length edge (a duplicate consecutive point in the data): normal collapses
      // to (0,0), producing a degenerate zero-width quad rather than dividing by zero into NaN.
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const base = vertex;
      emitVertex(ax, ay, nx, ny, level);
      emitVertex(ax, ay, -nx, -ny, level);
      emitVertex(bx, by, nx, ny, level);
      emitVertex(bx, by, -nx, -ny, level);

      indices[idxOffset++] = base;
      indices[idxOffset++] = base + 1;
      indices[idxOffset++] = base + 2;
      indices[idxOffset++] = base + 2;
      indices[idxOffset++] = base + 1;
      indices[idxOffset++] = base + 3;
    }
  }

  return { positions, normals, levels, indices };
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
