// Pure geometry helpers for the WebGL fill/outline pipeline.
//
// Voronoi cells and circle approximations are both convex, so a triangle fan from the first
// vertex is an exact triangulation - no earcut needed.

import { Point } from "../polyglot_data.types";

// Flat [x0,y0, x1,y1, x2,y2, ...] triangle-list vertices, winding preserved from the input
// polygon's order. An n-gon fans into (n-2) triangles, i.e. (n-2)*3 vertices / (n-2)*6 floats.
export function fanTriangulate(points: readonly Point[]): Float32Array {
  if (points.length < 3) {
    throw new Error(
      `fanTriangulate: need at least 3 points to form a polygon, got ${points.length}`
    );
  }
  const triangleCount = points.length - 2;
  const out = new Float32Array(triangleCount * 3 * 2);
  const [originX, originY] = points[0]!;
  let offset = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    out[offset++] = originX;
    out[offset++] = originY;
    out[offset++] = ax;
    out[offset++] = ay;
    out[offset++] = bx;
    out[offset++] = by;
  }
  return out;
}

// Throws if `points` is not a convex polygon: sign-consistency of the cross product across every
// consecutive edge pair. `path` is folded into the error message so a failure names the
// offending node, the same rationale CLAUDE.md gives for `nodeCircleAncestors` throwing rather
// than silently defaulting - silent fan-triangulation of a concave polygon renders subtly wrong
// instead of failing loudly.
//
// A zero cross product (three collinear consecutive points) is tolerated, not treated as a sign
// mismatch: it's inconclusive rather than a turn the "wrong" way, and the current Voronoi layout
// algorithm is known to occasionally produce a collinear vertex on an otherwise-valid cell. That
// is bad input we can't hand-fix in the data file, so this deliberately doesn't throw on it -
// only a genuine concave turn (an inconsistent sign) does.
//
// Guarded to development builds: this walks every vertex of every polygon, so it is skipped in
// production once the shape of the data is trusted.
export function assertConvex(points: readonly Point[], path: string): void {
  if (!import.meta.env.DEV) return;

  if (points.length < 3) {
    throw new Error(
      `assertConvex: polygon at "${path}" has fewer than 3 points (${points.length})`
    );
  }

  const n = points.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % n]!;
    const [cx, cy] = points[(i + 2) % n]!;
    const edge1x = bx - ax;
    const edge1y = by - ay;
    const edge2x = cx - bx;
    const edge2y = cy - by;
    const cross = edge1x * edge2y - edge1y * edge2x;

    if (cross === 0) continue; // collinear edge pair - inconclusive, not a violation

    const thisSign = cross > 0 ? 1 : -1;
    if (sign === 0) {
      sign = thisSign;
    } else if (thisSign !== sign) {
      throw new Error(
        `assertConvex: polygon at "${path}" is not convex at vertex ${i}`
      );
    }
  }
}
