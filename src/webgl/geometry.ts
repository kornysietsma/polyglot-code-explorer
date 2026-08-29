// Turns tree nodes into the typed arrays GlRenderer.ts uploads to the GPU.

import { HierarchyNode } from "d3";

import { nodeCircleAncestors } from "../nodeData";
import { TreeNode } from "../polyglot_data.types";
import { parseCssColour, parsePatternId } from "./colours";
import { assertConvex, fanTriangulate } from "./triangulate";

// The nesting levels `config.nesting.nestedWidths` / a theme's `nestedStrokes` configure, and the
// one extra shared slot after them holding `defaultWidth` / `defaultStroke`. Levels are looked up
// per-vertex in fixed-size GLSL arrays, so shaders.ts interpolates OUTLINE_LEVEL_COUNT into its
// `u_widths` / `u_strokeColours` declarations and GlRenderer's `NestingStyle` is a tuple of
// exactly that length - all three must agree, hence one definition here.
export const NESTED_LEVEL_COUNT = 4;
export const DEFAULT_OUTLINE_LEVEL = NESTED_LEVEL_COUNT;
export const OUTLINE_LEVEL_COUNT = NESTED_LEVEL_COUNT + 1;

export interface FillGeometry {
  // flat [x0,y0, x1,y1, ...] world-space triangle-list vertices
  positions: Float32Array;
  // flat [r0,g0,b0, r1,g1,b1, ...] per-vertex colour in 0-1, one triple per position vertex -
  // meaningless (left as 0,0,0) for a vertex whose patternIndex is >= 0, since the shader reads
  // the palette texture for that one instead (CLAUDE.md, "Team pattern stripes").
  colours: Float32Array;
  // one patternId per position vertex, or -1 for an ordinary flat-coloured vertex - the shader's
  // `a_patternIndex` attribute, keyed into the `u_palette` texture GlRenderer.setGeometry()'s
  // caller uploads alongside this.
  patternIndices: Float32Array;
}

// A convex n-gon fans into (n-2) triangles, i.e. (n-2)*3 vertices - shared by buildFills (which
// also needs the triangulated positions) and buildFillAttributes (which doesn't) so the two agree
// on vertex count without buildFillAttributes re-triangulating.
function fanVertexCount(polygonPointCount: number): number {
  return Math.max(polygonPointCount - 2, 0) * 3;
}

// Per-vertex colour and pattern-index buffers only, matching the vertex layout buildFills would
// produce for the same `nodes` - the colour-only counterpart used by GlRenderer.setColours() for
// a cheap `config` change: positions are untouched, so this skips fanTriangulate/assertConvex
// entirely rather than re-deriving geometry it won't use. A `url(#patternN)` fill
// (TeamPatternVisualization) routes that node's vertices through the pattern-texture path instead
// of parseCssColour, which can't parse it.
export function buildFillAttributes(
  nodes: readonly HierarchyNode<TreeNode>[],
  fillFn: (d: HierarchyNode<TreeNode>) => string
): { colours: Float32Array; patternIndices: Float32Array } {
  let totalVertices = 0;
  for (const node of nodes) {
    totalVertices += fanVertexCount(node.data.layout.polygon.length);
  }

  const colours = new Float32Array(totalVertices * 3);
  const patternIndices = new Float32Array(totalVertices);
  let colourOffset = 0;
  let vertexOffset = 0;
  for (const node of nodes) {
    const vertexCount = fanVertexCount(node.data.layout.polygon.length);
    const fill = fillFn(node);
    const patternId = parsePatternId(fill);
    const [r, g, b] = patternId === null ? parseCssColour(fill) : [0, 0, 0];
    for (let i = 0; i < vertexCount; i++) {
      colours[colourOffset] = r;
      colours[colourOffset + 1] = g;
      colours[colourOffset + 2] = b;
      colourOffset += 3;
      patternIndices[vertexOffset] = patternId === null ? -1 : patternId;
      vertexOffset++;
    }
  }
  return { colours, patternIndices };
}

// One triangle fan per node's polygon: Voronoi cells and circle approximations are both convex,
// so the fan is an exact triangulation.
export function buildFills(
  nodes: readonly HierarchyNode<TreeNode>[],
  fillFn: (d: HierarchyNode<TreeNode>) => string
): FillGeometry {
  const positionChunks: Float32Array[] = [];
  let totalVertices = 0;

  for (const node of nodes) {
    const polygon = node.data.layout.polygon;
    assertConvex(polygon, node.data.path);
    const triangles = fanTriangulate(polygon);
    positionChunks.push(triangles);
    totalVertices += triangles.length / 2;
  }

  const { colours, patternIndices } = buildFillAttributes(nodes, fillFn);
  return {
    positions: concatFloat32(positionChunks, totalVertices * 2),
    colours,
    patternIndices,
  };
}

export interface OutlineGeometry {
  // flat [x0,y0, x1,y1, ...] world-space vertices, 4 per edge
  positions: Float32Array;
  // flat [x0,y0, x1,y1, ...] signed offset direction, one pair per position vertex
  normals: Float32Array;
  // one outlineLevel() per position vertex, read by the shader as an index into the
  // u_widths/u_strokeColours uniform arrays - this is what makes a nesting colour or width
  // edit a uniform update with no buffer re-upload
  levels: Float32Array;
  // 6 per edge (two triangles covering the expanded quad), indexing into the arrays above
  indices: Uint32Array;
}

// Two kinds of outline share one buffer, told apart by `depth === circleAncestors` - which is
// exactly "every ancestor is circle-packed", i.e. the layout draws this node itself as a circle:
//  - a circle boundary. Every circle takes level 0, however deep it is nested, so all the
//    circle-packing in a file reads as one boundary style.
//  - an ordinary nesting stroke, levelled by depth inside the innermost circle, starting at
//    level 1 - so levels 1..3 mean "voronoi nesting inside a circle", consistently across
//    branches whose circles sit at different depths (CLAUDE.md, "Circle-packed layouts and
//    circleAncestors"). A file with no circle packing at all has no level-0 circles to draw, so
//    its top-level directories take level 0 and nothing shifts.
// The root falls back to the shared defaultStroke/defaultWidth slot, as does anything deeper
// than the configured nesting levels. Exported standalone (no HierarchyNode dependency) so it
// can be tested directly against the formula, including the `omf.json` case where circle depth
// varies per branch.
export function outlineLevel(depth: number, circleAncestors: number): number {
  if (depth === 0) return DEFAULT_OUTLINE_LEVEL; // the root, which is normally not outlined
  if (depth === circleAncestors) return 0; // a circle
  const level = circleAncestors > 0 ? depth - circleAncestors : depth - 1;
  if (level >= NESTED_LEVEL_COUNT) return DEFAULT_OUTLINE_LEVEL;
  return level;
}

// One outline per node, covering both the filled "cell" set and the wider "nesting" set.
// Assembling that union is the caller's job (Viz.tsx's `outlineNodesRef`), as is sorting it
// depth-descending first: painting is all fills then all outlines in buffer order with no depth
// test, so shallower/wider strokes have to come later in this list to land on top of deeper ones.
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
