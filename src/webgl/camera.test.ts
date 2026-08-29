import { describe, expect, it } from "vitest";

import {
  Camera,
  fitTransform,
  IDENTITY_ZOOM,
  overlayGroupTransform,
  screenToWorld,
  worldToClipTransform,
  worldToCss,
  worldToDevice,
} from "./camera";

describe("fitTransform", () => {
  it("scales to fit width and centres vertically in a wider-than-tall container", () => {
    // layout 100x100 (square) in a 400x200 container: width is the binding constraint.
    const fit = fitTransform({ width: 100, height: 100 }, 400, 200);
    expect(fit.scale).toBeCloseTo(2); // min(400/100, 200/100) = 2
    expect(fit.translateX).toBeCloseTo(200);
    expect(fit.translateY).toBeCloseTo(100);
  });

  it("scales to fit height and centres horizontally in a taller-than-wide container", () => {
    // layout 100x100 in a 200x400 container: height is the binding constraint.
    const fit = fitTransform({ width: 100, height: 100 }, 200, 400);
    expect(fit.scale).toBeCloseTo(2); // min(200/100, 400/100) = 2
    expect(fit.translateX).toBeCloseTo(100);
    expect(fit.translateY).toBeCloseTo(200);
  });

  it("maps the viewBox edges to the letterboxed edges of the container", () => {
    // layout 100x50 in a 200x200 container: width constrains (scale 2), leaving 50px
    // letterboxing top and bottom (200 - 50*2 = 100, split evenly).
    const fit = fitTransform({ width: 100, height: 50 }, 200, 200);
    const camera: Camera = { fit, zoom: IDENTITY_ZOOM, dpr: 1 };
    expect(worldToCss(camera, -50, -25)).toEqual([0, 50]);
    expect(worldToCss(camera, 50, 25)).toEqual([200, 150]);
  });

  it("rejects a non-positive layout or container size", () => {
    expect(() => fitTransform({ width: 0, height: 10 }, 100, 100)).toThrow();
    expect(() => fitTransform({ width: 10, height: 10 }, 0, 100)).toThrow();
  });
});

describe("screenToWorld", () => {
  const layout = { width: 120, height: 80 };

  it.each([1, 2])("round-trips through worldToCss at DPR %i", (dpr) => {
    const fit = fitTransform(layout, 300, 300);
    const camera: Camera = { fit, zoom: IDENTITY_ZOOM, dpr };
    for (const [wx, wy] of [
      [0, 0],
      [-60, -40],
      [60, 40],
      [12.5, -7.25],
    ] as const) {
      const [cssX, cssY] = worldToCss(camera, wx, wy);
      const [rx, ry] = screenToWorld(camera, cssX, cssY);
      expect(rx).toBeCloseTo(wx);
      expect(ry).toBeCloseTo(wy);
    }
  });

  it.each([1, 2])(
    "round-trips through worldToCss with a non-identity zoom transform, at DPR %i",
    (dpr) => {
      const fit = fitTransform(layout, 300, 300);
      const camera: Camera = { fit, zoom: { x: 37, y: -19, k: 2.5 }, dpr };
      for (const [wx, wy] of [
        [0, 0],
        [-60, -40],
        [60, 40],
      ] as const) {
        const [cssX, cssY] = worldToCss(camera, wx, wy);
        const [rx, ry] = screenToWorld(camera, cssX, cssY);
        expect(rx).toBeCloseTo(wx);
        expect(ry).toBeCloseTo(wy);
      }
    }
  );

  it("worldToDevice scales worldToCss by the DPR", () => {
    const fit = fitTransform(layout, 300, 300);
    const camera: Camera = { fit, zoom: { x: 5, y: -3, k: 1.5 }, dpr: 2 };
    const [cssX, cssY] = worldToCss(camera, 10, -10);
    const [deviceX, deviceY] = worldToDevice(camera, 10, -10);
    expect(deviceX).toBeCloseTo(cssX * 2);
    expect(deviceY).toBeCloseTo(cssY * 2);
  });
});

describe("overlayGroupTransform", () => {
  it("is the identity when the camera's zoom is the identity", () => {
    const fit = fitTransform({ width: 100, height: 100 }, 300, 300);
    const overlay = overlayGroupTransform({ fit, zoom: IDENTITY_ZOOM, dpr: 1 });
    expect(overlay).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("compensates for the browser's own viewBox fit so the SVG group lands on worldToCss", () => {
    // Simulates what the browser does natively for an SVG element with viewBox
    // [-w/2,-h/2,w,h]: apply the *same* fit to whatever the group's own transform produces.
    const fit = fitTransform({ width: 120, height: 80 }, 300, 200);
    const zoom = { x: 41, y: -17, k: 3.2 };
    const camera: Camera = { fit, zoom, dpr: 1 };
    const overlay = overlayGroupTransform(camera);

    for (const [wx, wy] of [
      [0, 0],
      [-60, -40],
      [60, 40],
      [15, -9],
    ] as const) {
      const groupX = wx * overlay.k + overlay.x;
      const groupY = wy * overlay.k + overlay.y;
      // the browser's native fit, applied on top of our group transform
      const renderedX = groupX * fit.scale + fit.translateX;
      const renderedY = groupY * fit.scale + fit.translateY;

      const [expectedX, expectedY] = worldToCss(camera, wx, wy);
      expect(renderedX).toBeCloseTo(expectedX);
      expect(renderedY).toBeCloseTo(expectedY);
    }
  });
});

describe("worldToClipTransform", () => {
  function applyClip(
    clip: ReturnType<typeof worldToClipTransform>,
    worldX: number,
    worldY: number
  ): [number, number] {
    return [
      worldX * clip.scaleX + clip.translateX,
      worldY * clip.scaleY + clip.translateY,
    ];
  }

  it("maps the container's top-left and bottom-right CSS corners to clip (-1,1) and (1,-1)", () => {
    const layout = { width: 100, height: 60 };
    const [canvasWidth, canvasHeight] = [300, 200]; // dpr 1, so device px == css px
    const fit = fitTransform(layout, canvasWidth, canvasHeight);
    const camera: Camera = { fit, zoom: IDENTITY_ZOOM, dpr: 1 };
    const clip = worldToClipTransform(camera, canvasWidth, canvasHeight);

    const topLeftWorld = screenToWorld(camera, 0, 0);
    const bottomRightWorld = screenToWorld(camera, canvasWidth, canvasHeight);

    const [tlX, tlY] = applyClip(clip, ...topLeftWorld);
    expect(tlX).toBeCloseTo(-1);
    expect(tlY).toBeCloseTo(1);

    const [brX, brY] = applyClip(clip, ...bottomRightWorld);
    expect(brX).toBeCloseTo(1);
    expect(brY).toBeCloseTo(-1);
  });

  it.each([1, 2])(
    "round-trips an arbitrary CSS pixel to the same clip coordinate the formula predicts, at DPR %i",
    (dpr) => {
      const layout = { width: 120, height: 80 };
      const [cssWidth, cssHeight] = [300, 300];
      const [canvasWidth, canvasHeight] = [cssWidth * dpr, cssHeight * dpr];
      const fit = fitTransform(layout, cssWidth, cssHeight);
      const zoom = { x: 17, y: -9, k: 2.2 };
      const camera: Camera = { fit, zoom, dpr };
      const clip = worldToClipTransform(camera, canvasWidth, canvasHeight);

      for (const [cssX, cssY] of [
        [0, 0],
        [cssWidth, cssHeight],
        [150, 40],
        [12.5, 287.25],
      ] as const) {
        const [worldX, worldY] = screenToWorld(camera, cssX, cssY);
        const [clipX, clipY] = applyClip(clip, worldX, worldY);
        expect(clipX).toBeCloseTo(((cssX * dpr) / canvasWidth) * 2 - 1);
        expect(clipY).toBeCloseTo(1 - ((cssY * dpr) / canvasHeight) * 2);
      }
    }
  );

  it("rejects a non-positive canvas size", () => {
    const fit = fitTransform({ width: 10, height: 10 }, 100, 100);
    const camera: Camera = { fit, zoom: IDENTITY_ZOOM, dpr: 1 };
    expect(() => worldToClipTransform(camera, 0, 100)).toThrow();
    expect(() => worldToClipTransform(camera, 100, -1)).toThrow();
  });
});
