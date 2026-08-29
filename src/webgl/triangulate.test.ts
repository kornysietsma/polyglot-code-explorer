import { describe, expect, it } from "vitest";

import { Point } from "../polyglot_data.types";
import { assertConvex, fanTriangulate } from "./triangulate";

// A real Voronoi cell polygon, lifted verbatim from data/default.json
// (package.json's node, under src/webgl/) - 15 points, clockwise as scanned.
const REAL_VORONOI_CELL: Point[] = [
  [20.957363624359402, -81.2677420372966],
  [18.75530043618736, -85.15492718796685],
  [16.365154594540975, -88.9293799345189],
  [13.792684170104899, -92.58200728968318],
  [11.044086469453301, -96.10400975422891],
  [8.125983105195774, -99.48690251572793],
  [5.045404043932571, -102.72253588921139],
  [1.8097706704490881, -105.80311495047451],
  [-1.5731220910500463, -108.721218314732],
  [-5.095124555595783, -111.4698160153835],
  [-8.747751910760229, -114.04228643981958],
  [-12.522204657312242, -116.43243228146585],
  [-16.40938980798242, -118.63449546963776],
  [-19.615528621218896, -120.24833012790567],
  [21.37785394268993, -80.43237124929001],
];

function regularPolygon(sides: number, radius = 10): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (2 * Math.PI * i) / sides;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as Point;
  });
}

describe("fanTriangulate", () => {
  it("emits one triangle for a 3-gon, preserving winding", () => {
    const triangle: Point[] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    expect(fanTriangulate(triangle)).toEqual(
      new Float32Array([0, 0, 1, 0, 0, 1])
    );
  });

  it("emits two triangles for a 4-gon (quad), both sharing the first vertex", () => {
    const quad: Point[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(fanTriangulate(quad)).toEqual(
      new Float32Array([
        // fan(p0,p1,p2)
        0, 0, 1, 0, 1, 1,
        // fan(p0,p2,p3)
        0, 0, 1, 1, 0, 1,
      ])
    );
  });

  it("produces (n-2)*3 vertices for a 12-gon", () => {
    const dodecagon = regularPolygon(12);
    const out = fanTriangulate(dodecagon);
    expect(out.length).toBe((12 - 2) * 3 * 2);
  });

  it("rejects degenerate input with fewer than 3 points", () => {
    expect(() => fanTriangulate([])).toThrow(/at least 3 points/);
    expect(() => fanTriangulate([[0, 0]])).toThrow(/at least 3 points/);
    expect(() =>
      fanTriangulate([
        [0, 0],
        [1, 1],
      ])
    ).toThrow(/at least 3 points/);
  });
});

describe("assertConvex", () => {
  it("accepts a real Voronoi cell lifted from default.json", () => {
    expect(() => assertConvex(REAL_VORONOI_CELL, "package.json")).not.toThrow();
  });

  it("accepts a circle approximation", () => {
    expect(() => assertConvex(regularPolygon(32), "circle")).not.toThrow();
  });

  it("throws on a hand-built concave polygon", () => {
    // an arrow/dart shape: the fourth vertex bites inward
    const concave: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 1],
      [0, 4],
    ];
    expect(() => assertConvex(concave, "concave/dart")).toThrow(/not convex/);
  });

  it("tolerates a collinear vertex rather than treating it as concave", () => {
    // the current Voronoi layout algorithm can produce a collinear vertex on an
    // otherwise-valid cell; that's bad input we can't hand-fix, so it must not throw
    const collinear: Point[] = [
      [0, 0],
      [1, 0],
      [2, 0], // collinear with the previous two
      [1, 1],
    ];
    expect(() => assertConvex(collinear, "collinear")).not.toThrow();
  });

  it("rejects degenerate input with fewer than 3 points", () => {
    expect(() => assertConvex([], "empty")).toThrow(/fewer than 3 points/);
    expect(() => assertConvex([[0, 0]], "single-point")).toThrow(
      /fewer than 3 points/
    );
  });
});
