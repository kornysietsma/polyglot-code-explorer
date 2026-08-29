// Pure camera math shared by the canvas renderer and (still, for now) the SVG overlay - no
// `gl` import, so this is testable under Vitest's jsdom environment (plan.md decision 6).
//
// The full transform chain (plan.md, "Technical context the steps assume") is:
//   world -> viewBox fit -> d3.zoom transform -> CSS pixels -> (x DPR) device pixels
//
// "Fit" is the fixed, resize-driven half; "zoom" is the interactive half d3.zoom drives. Zoom
// composes *after* fit, in CSS-pixel space local to the container's top-left corner - which is
// why d3.zoom is attached to a plain wrapper div (see Viz.tsx's chart-stack) rather than to an
// SVG with its own viewBox: d3.pointer() resolves coordinates local to an SVG element through
// its viewBox transform, which would put zoom back in world units, not CSS pixels.

export interface LayoutSize {
  width: number;
  height: number;
}

export interface FitTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ZoomTransform {
  x: number;
  y: number;
  k: number;
}

export interface Camera {
  fit: FitTransform;
  zoom: ZoomTransform;
  dpr: number;
}

export const IDENTITY_ZOOM: ZoomTransform = { x: 0, y: 0, k: 1 };

// Reproduces the SVG `xMidYMid meet` viewBox fit for a viewBox of
// [-layout.width/2, -layout.height/2, layout.width, layout.height] - which is what Viz.tsx's
// draw() always sets (see CLAUDE.md). Centring on a viewBox already centred at the origin makes
// the general SVG fit formula's translate collapse to exactly half the container size: the
// viewBox-origin offset and the meet-letterboxing offset cancel algebraically.
export function fitTransform(
  layout: LayoutSize,
  clientWidth: number,
  clientHeight: number
): FitTransform {
  if (layout.width <= 0 || layout.height <= 0) {
    throw new Error(
      `fitTransform: layout must have positive width/height, got ${layout.width}x${layout.height}`
    );
  }
  if (clientWidth <= 0 || clientHeight <= 0) {
    throw new Error(
      `fitTransform: container must have positive width/height, got ${clientWidth}x${clientHeight}`
    );
  }
  const scale = Math.min(
    clientWidth / layout.width,
    clientHeight / layout.height
  );
  return { scale, translateX: clientWidth / 2, translateY: clientHeight / 2 };
}

// World units -> CSS pixels, local to the container's top-left corner (pre-DPR).
export function worldToCss(
  camera: Camera,
  worldX: number,
  worldY: number
): [number, number] {
  const { fit, zoom } = camera;
  const fittedX = worldX * fit.scale + fit.translateX;
  const fittedY = worldY * fit.scale + fit.translateY;
  return [fittedX * zoom.k + zoom.x, fittedY * zoom.k + zoom.y];
}

// CSS pixels, local to the container's top-left corner -> world units. Exact inverse of
// worldToCss. This is screenToWorld from spec.md; the caller is responsible for turning a raw
// MouseEvent's clientX/clientY into container-local coordinates first (subtracting
// getBoundingClientRect() offsets) - kept out of this module so it stays DOM-free and pure.
export function screenToWorld(
  camera: Camera,
  localX: number,
  localY: number
): [number, number] {
  const { fit, zoom } = camera;
  const fittedX = (localX - zoom.x) / zoom.k;
  const fittedY = (localY - zoom.y) / zoom.k;
  return [
    (fittedX - fit.translateX) / fit.scale,
    (fittedY - fit.translateY) / fit.scale,
  ];
}

// World units -> device pixels (a canvas's backing-store resolution, i.e. post-DPR).
export function worldToDevice(
  camera: Camera,
  worldX: number,
  worldY: number
): [number, number] {
  const [cssX, cssY] = worldToCss(camera, worldX, worldY);
  return [cssX * camera.dpr, cssY * camera.dpr];
}

export interface ClipTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

// World units -> WebGL clip space [-1,1], for a canvas whose backing store is
// canvasWidthPx x canvasHeightPx device pixels (i.e. after the DPR multiply - see
// resizeCanvasToDisplaySize in Viz.tsx). Composes worldToDevice with the standard
// device-pixel -> clip-space mapping: device pixels grow down from the top-left, clip space
// grows up, so Y flips here - a flip a 2D canvas context never needs, which is why this isn't
// folded into worldToDevice. Returned as a scale/translate pair rather than a matrix so the
// vertex shader can compute `a_pos * u_scale + u_translate` directly.
export function worldToClipTransform(
  camera: Camera,
  canvasWidthPx: number,
  canvasHeightPx: number
): ClipTransform {
  if (canvasWidthPx <= 0 || canvasHeightPx <= 0) {
    throw new Error(
      `worldToClipTransform: canvas must have positive size, got ${canvasWidthPx}x${canvasHeightPx}`
    );
  }
  const { fit, zoom, dpr } = camera;
  const deviceScale = fit.scale * zoom.k * dpr;

  return {
    scaleX: (2 * deviceScale) / canvasWidthPx,
    scaleY: (-2 * deviceScale) / canvasHeightPx,
    translateX:
      (2 * dpr * (fit.translateX * zoom.k + zoom.x)) / canvasWidthPx - 1,
    translateY:
      1 - (2 * dpr * (fit.translateY * zoom.k + zoom.y)) / canvasHeightPx,
  };
}

// The overlay <svg> keeps its own viewBox, so the browser re-applies an identical fit to
// whatever transform we set on its <g> automatically. To keep the overlay pixel-locked to the
// canvas - which applies fit then zoom explicitly - the group's transform has to pre-compensate
// for the fit the browser is about to re-apply: it is fit^-1 composed with (fit-then-zoom).
// Solving that composition algebraically collapses to the form below (a translate + scale, so
// it can be written straight into an SVG `transform` attribute). See plan.md step 1 progress
// notes for the derivation.
export function overlayGroupTransform(camera: Camera): ZoomTransform {
  const { fit, zoom } = camera;
  return {
    k: zoom.k,
    x: ((zoom.k - 1) * fit.translateX + zoom.x) / fit.scale,
    y: ((zoom.k - 1) * fit.translateY + zoom.y) / fit.scale,
  };
}
