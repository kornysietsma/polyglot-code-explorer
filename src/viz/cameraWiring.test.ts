import { describe, expect, it } from "vitest";

import { minimalFileNode } from "../testFixtures";
import { layoutSize } from "./cameraWiring";

// The only pure part of the camera wiring - the rest is D3, the DOM and a GL context, which
// CLAUDE.md's test boundary leaves to the screenshot suite and manual checks.
describe("layoutSize", () => {
  const nodeSized = (width?: number, height?: number) =>
    minimalFileNode("root", "", { layout: { width, height } });

  it("reads the root node's own dimensions", () => {
    expect(layoutSize(nodeSized(800, 600))).toEqual({
      width: 800,
      height: 600,
    });
  });

  // Throwing rather than defaulting is the point: a zero or missing dimension would fit the
  // camera to nothing and render the whole tree as a dot, with no error to explain it.
  it.each([
    ["no width", undefined, 600],
    ["no height", 800, undefined],
    ["a zero width", 0, 600],
    ["a zero height", 800, 0],
  ])("throws on %s", (_name, width, height) => {
    expect(() => layoutSize(nodeSized(width, height))).toThrow(
      "Root node has no width or height!"
    );
  });
});
