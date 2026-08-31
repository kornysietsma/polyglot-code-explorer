// Everything imperative that stands between the browser and `webgl/camera.ts`: fitting the camera
// to the chart-stack's box, the `d3.zoom` behaviour, and the two watchers that keep the canvas
// correct when the viewport or the GL context changes underneath it.
//
// `camera.ts` itself is pure and unit-tested and knows nothing of the DOM; this is the wiring
// around it, verified by the screenshot suite and by hand. `layoutSize` is the one pure part and
// has tests.

import * as d3 from "d3";
import { D3ZoomEvent, Selection } from "d3";
import { RefObject } from "react";

import { TreeNode } from "../polyglot_data.types";
import { VizDataRef } from "../viz.types";
import {
  Camera,
  fitTransform,
  IDENTITY_ZOOM,
  LayoutSize,
  overlayGroupTransform,
} from "../webgl/camera";
import { VizRefs } from "./vizRefs";

// The root node's layout dimensions, which the whole camera is fitted to. Throws rather than
// defaulting: a tree with no size would silently render as a dot.
export function layoutSize(files: TreeNode): LayoutSize {
  const { width, height } = files.layout;
  if (!width || !height) {
    throw new Error("Root node has no width or height!");
  }
  return { width, height };
}

// Re-fits the camera to the chart-stack's current CSS box and DPR, and matches the canvas's
// backing-store resolution to it. The canvas's CSS size stays declarative (100%/100% in
// main_areas.scss); only the device-pixel resolution is set here. Returns the camera it stored, so
// callers that go on to draw don't re-read the ref.
//
// Shared by draw() and the resize/DPR handlers, which differ only in whether they keep the
// existing zoom - a resize must not throw away the user's pan and zoom, a full redraw resets it.
export function refitCamera(
  refs: VizRefs,
  layout: LayoutSize,
  zoom = IDENTITY_ZOOM
): Camera | null {
  const chartStackEl = refs.chartStack.current;
  const glCanvas = refs.glCanvas.current;
  if (!chartStackEl || !glCanvas) return null;

  const cssWidth = chartStackEl.clientWidth;
  const cssHeight = chartStackEl.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const camera: Camera = {
    fit: fitTransform(layout, cssWidth, cssHeight),
    zoom,
    dpr,
  };
  refs.camera.current = camera;
  glCanvas.width = Math.round(cssWidth * dpr);
  glCanvas.height = Math.round(cssHeight * dpr);
  return camera;
}

// zooming - see https://observablehq.com/@d3/zoomable-map-tiles?collection=@d3/d3-zoom
//
// Attached to the chart-stack wrapper, not to the SVG or the canvas: it's a plain HTML
// element with no viewBox, so d3.pointer() reports coordinates in plain CSS pixels local to
// it - which is why the camera composes fit *then* zoom (camera.ts) - and, being an ancestor of
// both layers, it keeps receiving events no matter which one currently takes pointer events.
//
// Called from the end of draw(), which is why it is handed the camera, renderer, canvas and
// overlay group it has just built rather than re-reading them.
// Generic in the group's datum: all it does with the overlay group is set a transform on it, and
// draw() types that group by what else it carries (coupling links).
export function attachZoom<Datum>(
  refs: VizRefs,
  chartStackEl: HTMLDivElement,
  group: Selection<SVGGElement, Datum, SVGSVGElement, unknown>,
  camera: Camera,
  w: number,
  h: number
) {
  // Both are non-null by the time draw() gets here; re-read from refs and guard the same way
  // refitCamera above does, rather than adding two more parameters to an already long signature.
  const glCanvas = refs.glCanvas.current;
  const glRenderer = refs.glRenderer.current;
  if (!glCanvas || !glRenderer) return;

  const zoomed = (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
    // Re-read rather than closing over `camera`: a resize replaces the whole camera, and this
    // handler outlives it.
    const fitted = refs.camera.current ?? camera;
    const nextCamera: Camera = {
      ...fitted,
      zoom: {
        x: event.transform.x,
        y: event.transform.y,
        k: event.transform.k,
      },
    };
    refs.camera.current = nextCamera;

    const overlay = overlayGroupTransform(nextCamera);
    group.attr(
      "transform",
      `translate(${overlay.x},${overlay.y}) scale(${overlay.k})`
    );

    glRenderer.setTransform(nextCamera, glCanvas.width, glCanvas.height);
    glRenderer.draw();
  };

  d3.select(chartStackEl).call(
    d3
      .zoom<HTMLDivElement, unknown>()
      .extent([
        [0, 0],
        [w, h],
      ])
      .scaleExtent([0.5, 16])
      .on("zoom", zoomed)
  );
}

// Re-fit on resize or a DPR change, then redraw the existing geometry at the new transform - no
// rebuild needed. The overlay SVG's own viewBox re-fits itself natively; nothing to do there.
// Skips until the first `draw()` has created the renderer, and keeps the user's current zoom.
//
// ResizeObserver alone isn't enough: dragging the window to a monitor with a different pixel
// ratio changes the DPR without changing the CSS box, so the canvas would keep its old
// backing-store resolution and render soft. `matchMedia` on the current ratio fires exactly when
// it stops matching, and is re-armed on the new ratio each time.
//
// Returns the teardown its caller's `useEffect` returns, or undefined when there is nothing yet
// to watch.
export function watchViewport(refs: VizRefs, dataRef: VizDataRef) {
  const stackEl = refs.chartStack.current;
  if (!stackEl) return;

  const refitAndDraw = () => {
    const glRenderer = refs.glRenderer.current;
    const canvas = refs.glCanvas.current;
    if (!glRenderer || !canvas) return;
    const { layout } = dataRef.current.data.tree;
    if (!layout.width || !layout.height) return;
    const camera = refitCamera(
      refs,
      { width: layout.width, height: layout.height },
      refs.camera.current?.zoom ?? IDENTITY_ZOOM
    );
    if (!camera) return;
    glRenderer.setTransform(camera, canvas.width, canvas.height);
    glRenderer.draw();
  };

  const observer = new ResizeObserver(refitAndDraw);
  observer.observe(stackEl);

  let dprQuery: MediaQueryList | null = null;
  const watchDpr = () => {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );
    dprQuery.addEventListener("change", onDprChange);
  };
  function onDprChange() {
    refitAndDraw();
    watchDpr();
  }
  watchDpr();

  return () => {
    observer.disconnect();
    dprQuery?.removeEventListener("change", onDprChange);
  };
}

// A lost GL context takes every buffer, program and texture with it, and the canvas stays blank
// with no error unless we rebuild. preventDefault() on the loss event is what makes the browser
// promise a restore; on restore the old GlRenderer's handles are all dead, so drop it and let
// draw() build a new one against the same canvas.
//
// Returns the teardown its caller's `useEffect` returns, or undefined when there is no canvas yet.
export function watchContextLoss(
  refs: VizRefs,
  redrawAllRef: RefObject<(() => void) | null>
) {
  const canvas = refs.glCanvas.current;
  if (!canvas) return;

  const handleLost = (event: Event) => {
    event.preventDefault();
    console.warn("WebGL context lost - waiting for restore");
  };
  const handleRestored = () => {
    console.warn("WebGL context restored - rebuilding renderer");
    refs.glRenderer.current = null;
    redrawAllRef.current?.();
  };

  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost);
    canvas.removeEventListener("webglcontextrestored", handleRestored);
  };
}
