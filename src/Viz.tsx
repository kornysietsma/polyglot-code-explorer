// I use wildcard import for things that are not obviously d3 like "d3.color()"
import * as d3 from "d3";
import {
  axisBottom,
  brushX,
  D3ZoomEvent,
  HierarchyNode,
  ScaleLinear,
  scaleLinear,
  ScaleTime,
  scaleUtc,
  Selection,
} from "d3";
import _ from "lodash";
import React, { RefObject, useEffect, useMemo, useRef } from "react";

import { DefaultProps } from "./components.types";
import { dateToUnix, unixToDate } from "./datetimes";
import {
  CouplingLink,
  nodeCouplingFilesFiltered,
  nodeHasCouplingData,
} from "./model/coupling";
import {
  nodeCenter,
  nodeCircleAncestors,
  nodeDescendants,
} from "./model/nodeAccessors";
import { FeatureFlags, Point, TreeNode } from "./polyglot_data.types";
import { TimescaleIntervalData } from "./preprocess";
import { State } from "./state";
import { Action } from "./state/actions";
import { themedColours } from "./state/colours";
import { VizMetadata } from "./viz.types";
import { selectNodesToDraw } from "./vizNodeSelection";
import VizTooltip from "./VizTooltip";
import {
  buildFillFn,
  buildFillPalette,
  buildNestingStyle,
  isNestingOnlyChange,
} from "./vizUpdatePaths";
import {
  Camera,
  fitTransform,
  IDENTITY_ZOOM,
  LayoutSize,
  overlayGroupTransform,
  screenToWorld,
} from "./webgl/camera";
import { GlRenderer } from "./webgl/GlRenderer";

// The mutable handles draw()/update() work through. Bundled rather than passed one by one: they
// are all set imperatively outside React's render cycle (CLAUDE.md: `react-hooks/refs` is off
// repo-wide for exactly this reason), and every one of them is needed by both functions.
interface VizRefs {
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

const redrawSelection = (
  svgSelection: Selection<
    SVGPathElement,
    HierarchyNode<TreeNode>,
    SVGGElement,
    unknown
  >,
  state: State
) => {
  const { config } = state;

  const strokeWidthFn = (d: HierarchyNode<TreeNode>) => {
    const nesting = d.depth - nodeCircleAncestors(d.data);
    if (nesting < 0) return 0;
    if (nesting >= config.nesting.nestedWidths.length)
      return config.nesting.defaultWidth;
    return config.nesting.nestedWidths[nesting] || config.nesting.defaultWidth;
  };

  return svgSelection
    .attr("d", (d) => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("stroke-width", strokeWidthFn)
    .style("stroke", themedColours(config).selectedStroke)
    .style("fill", "none")
    .style("vector-effect", "non-scaling-stroke"); // so zooming doesn't make thick lines
};

function findSelectionPath(
  state: State,
  nodesByPath: Map<string, HierarchyNode<TreeNode>>
): HierarchyNode<TreeNode>[] {
  if (!state.config.selectedNode) return [];

  // This is where we need to go from a node path to the hierarchy!
  // or can we store this index elsewhere - when we build the hierarchy,
  // map paths to HierarchyNode<TreeNode> once and carry that around.

  let node: HierarchyNode<TreeNode> | undefined = nodesByPath.get(
    state.config.selectedNode
  );
  if (node === undefined) {
    console.error(
      "Hierarchy data not yet linked while finding selection! Ignoring"
    );
    return [];
  }
  const results: HierarchyNode<TreeNode>[] = [];
  while (node.parent) {
    results.push(node);
    node = node.parent;
  }
  results.push(node);
  return results.reverse();
}

const update = (
  refs: VizRefs,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State,
  nestingOnlyChange: boolean
) => {
  if (!refs.overlaySvg.current) {
    throw new Error("No current container");
  }
  const svg = d3.select(refs.overlaySvg.current);
  const glCanvas = refs.glCanvas.current;
  const camera = refs.camera.current;
  const glRenderer = refs.glRenderer.current;
  const visibleNodes = refs.visibleNodes.current;
  if (!glCanvas || !camera || !glRenderer || !visibleNodes) {
    throw new Error(
      "update called before draw, so the WebGL renderer is not ready"
    );
  }
  // A cheap `config` change never touches geometry or the picking index. Anything that can move
  // fill colour (visualisation, date range, teams, theme) rewrites the colour buffer; a
  // nesting-only edit skips even that, since level is a per-vertex attribute and the widths and
  // colours it indexes are uniforms. The nesting uniforms are then rewritten either way - on the
  // colour path because a theme switch moves nestedStrokes/defaultStroke too.
  if (!nestingOnlyChange) {
    glRenderer.setColours(
      visibleNodes,
      buildFillFn(metadata, features, state),
      buildFillPalette(state)
    );
  }
  glRenderer.setNestingStyle(buildNestingStyle(state));
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  // TODO: DRY this up - or should selecting just be expensive config?
  if (!metadata.hierarchyNodesByPath) {
    throw new Error(
      "update called before draw, so we have no hierarchyNodesByPath!"
    );
  }
  const selectionPath = findSelectionPath(state, metadata.hierarchyNodesByPath);
  const group: Selection<
    SVGGElement,
    HierarchyNode<TreeNode>,
    SVGSVGElement,
    unknown
  > = svg.selectAll(".topGroup");
  const selectionNodes = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".selected")
    .data(selectionPath, (node) => node.data.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), state);
  selectionNodes.exit().remove();
};

// flatten out all nodes for coupling line display
function normalizedCouplingNodes(rootNode: TreeNode, state: State) {
  const { config, couplingConfig } = state;
  const {
    dateRange: { earliest, latest },
  } = config.filters;
  return couplingConfig.shown === false
    ? []
    : nodeDescendants(rootNode)
        .filter(nodeHasCouplingData)
        .map(
          (d) =>
            nodeCouplingFilesFiltered(
              d,
              earliest,
              latest,
              couplingConfig.minRatio,
              couplingConfig.minBursts,
              couplingConfig.maxCommonRoots
            ) ?? []
        )
        .flat();
}

function arcPath(leftHand: boolean, source: Point, target: Point) {
  const x1 = leftHand ? source[0] : target[0];
  const y1 = leftHand ? source[1] : target[1];
  const x2 = leftHand ? target[0] : source[0];
  const y2 = leftHand ? target[1] : source[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dr = Math.sqrt(dx * dx + dy * dy);
  const sweep = leftHand ? 0 : 1;
  const xRotation = 0;
  const largeArc = 0;

  return `M${x1},${y1}A${dr}, ${dr} ${xRotation}, ${largeArc}, ${sweep} ${x2},${y2}`;
}

function drawCoupling(
  group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown>,
  files: TreeNode,
  metadata: VizMetadata,
  state: State,
  dispatch: React.Dispatch<Action>
) {
  const { config } = state;
  const { nodesByPath } = metadata;
  const allCouplingNodes = normalizedCouplingNodes(files, state);

  const couplingNodes = group
    .selectAll<SVGPathElement, CouplingLink>(".coupling")
    .data(
      allCouplingNodes,
      (node) => node.source.path + "->" + node.targetFile
    );

  // TODO - consider reworking this with join which seems to be the new hotness?
  const newCouplingNodes = couplingNodes
    .enter()
    .append("path")
    .classed("coupling", true);

  const couplingLine = (d: CouplingLink) => {
    const sourcePos = nodeCenter(d.source);
    const target = nodesByPath.get(d.targetFile);
    const targetPos = target ? nodeCenter(target) : undefined;
    if (sourcePos == undefined || targetPos == undefined) {
      throw new Error("Can't find source or target for coupling line");
    }

    return arcPath(true, sourcePos, targetPos);
    // return `${line()([sourcePos, targetPos])}`;
  };

  const couplingLineStroke = (d: CouplingLink) => {
    const colour = d3.color(themedColours(config).couplingStroke);
    if (colour == null) {
      throw new Error("Invalid colour in theme");
    }
    const ratio = d.targetCount / d.sourceCount;
    colour.opacity = ratio;
    return colour.toString();
  };

  const couplingLineWidth = (d: CouplingLink) => {
    const ratio = d.targetCount / d.sourceCount;
    if (ratio >= 0.95) return "3px";
    if (ratio > 0.8) return "2px";
    return "1px";
  };

  const couplingLabel = (d: CouplingLink) => {
    const ratio = d.targetCount / d.sourceCount;
    const from = d.source.path;
    return `${from} -> ${d.targetFile} (${ratio.toFixed(3)})`;
  };

  couplingNodes
    .merge(newCouplingNodes)
    .attr("d", couplingLine)
    .attr("marker-end", "url(#arrow)") // sadly the marker colour is fixed!
    .style("stroke", couplingLineStroke)
    .style("stroke-width", couplingLineWidth)
    .style("fill", "none")
    .style("vector-effect", "non-scaling-stroke")
    .on(
      "click",
      function (this: SVGPathElement, event: PointerEvent, node: CouplingLink) {
        dispatch({ type: "selectNode", payload: node.source.path });
      }
    )
    .append("svg:title")
    .text(couplingLabel);

  couplingNodes.exit().remove();
}

const updateCoupling = (
  refs: VizRefs,
  files: TreeNode,
  metadata: VizMetadata,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  if (!refs.overlaySvg.current) {
    throw new Error("No current container");
  }
  const svg = d3.select(refs.overlaySvg.current);
  const group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown> =
    svg.selectAll(".topGroup");
  drawCoupling(group, files, metadata, state, dispatch);
};

// Re-fits the camera to the chart-stack's current CSS box and DPR, and matches the canvas's
// backing-store resolution to it. The canvas's CSS size stays declarative (100%/100% in
// main_areas.scss); only the device-pixel resolution is set here. Returns the camera it stored, so
// callers that go on to draw don't re-read the ref.
//
// Shared by draw() and the resize/DPR handlers, which differ only in whether they keep the
// existing zoom - a resize must not throw away the user's pan and zoom, a full redraw resets it.
function refitCamera(
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

// The root node's layout dimensions, which the whole camera is fitted to. Throws rather than
// defaulting: a tree with no size would silently render as a dot.
function layoutSize(files: TreeNode): LayoutSize {
  const { width, height } = files.layout;
  if (!width || !height) {
    throw new Error("Root node has no width or height!");
  }
  return { width, height };
}

const draw = (
  refs: VizRefs,
  files: TreeNode,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  const { expensiveConfig } = state;

  if (!refs.overlaySvg.current) {
    console.warn("in draw but d3container not yet current");
    return;
  }
  const chartStackEl = refs.chartStack.current;
  const glCanvas = refs.glCanvas.current;
  if (!chartStackEl || !glCanvas) {
    console.warn("in draw but canvas layer not yet mounted");
    return;
  }
  const vizEl = refs.overlaySvg.current;
  const w = chartStackEl.clientWidth;
  const h = chartStackEl.clientHeight;

  const layout = layoutSize(files);
  const camera = refitCamera(refs, layout);
  if (!camera) {
    console.warn("in draw but canvas layer not yet mounted");
    return;
  }
  if (!refs.glRenderer.current) {
    refs.glRenderer.current = new GlRenderer(glCanvas);
  }
  const glRenderer = refs.glRenderer.current;

  const svg = d3
    .select(vizEl)
    .attr("viewBox", [
      -layout.width / 2,
      -layout.height / 2,
      layout.width,
      layout.height,
    ]);
  const group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown> =
    svg.selectAll(".topGroup");
  const rootNode = d3.hierarchy(files); // .sum(d => d.value);

  const hierarchyNodesByPath: Map<string, HierarchyNode<TreeNode>> = new Map();
  rootNode.descendants().forEach((node) => {
    hierarchyNodesByPath.set(node.data.path, node);
  });
  metadata.hierarchyNodesByPath = hierarchyNodesByPath;

  const { fills, outlines } = selectNodesToDraw(
    rootNode,
    expensiveConfig.depth
  );
  refs.visibleNodes.current = fills;
  refs.outlineNodes.current = outlines;

  glRenderer.setGeometry(
    fills,
    outlines,
    buildFillFn(metadata, features, state),
    buildNestingStyle(state),
    buildFillPalette(state)
  );
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  const selectionPath = findSelectionPath(state, metadata.hierarchyNodesByPath);
  const selectionNodes = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".selected")
    .data(selectionPath, (node) => node.data.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), state);

  selectionNodes.exit().remove();

  drawCoupling(group, files, metadata, state, dispatch);

  // if we are redrawing after expensive config change, need to force coupling nodes to the front!
  // TODO: better would be to use a different top-level group...
  group.selectAll(".coupling").raise();

  // zooming - see https://observablehq.com/@d3/zoomable-map-tiles?collection=@d3/d3-zoom
  //
  // Attached to the chart-stack wrapper, not to the SVG or the canvas: it's a plain HTML
  // element with no viewBox, so d3.pointer() reports coordinates in plain CSS pixels local to
  // it - which is why the camera composes fit *then* zoom (camera.ts) - and, being an ancestor of
  // both layers, it keeps receiving events no matter which one currently takes pointer events.
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
};

// Deliberately not date-fns' `addDays`: this adds absolute elapsed time, which is what the
// UTC timescale below wants. date-fns' version is local-calendar-based, so it would shift by
// an hour across a DST boundary.
function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setTime(result.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

function drawTimescale(
  d3TimescaleContainer: React.RefObject<SVGSVGElement | null>,
  timescaleData: TimescaleIntervalData[],
  features: FeatureFlags,
  state: State,
  dispatch: React.Dispatch<Action>
) {
  const { config } = state;
  const { timescaleHeight } = config.layout;
  const {
    dateRange: { earliest, latest },
  } = config.filters;
  const margin = { left: 5, right: 5, bottom: 20, top: 10 };
  const height = timescaleHeight - (margin.bottom + margin.top);

  if (!d3TimescaleContainer.current) {
    console.warn("in drawTimescale but d3TimescaleContainer not yet current");
    return;
  }
  const vizEl = d3TimescaleContainer.current;
  const width = vizEl.clientWidth;
  const svg = d3
    .select(vizEl)
    .attr("viewBox", [0, 0, width, height])
    .style("height", `${height}px`);

  const valueFn = features.git
    ? (d: TimescaleIntervalData) => d.commits
    : (d: TimescaleIntervalData) => d.files; // if we have no git, we count files modified

  // we might simplify these, from an overly generic example
  const area = (
    xScale: ScaleTime<number, number, never>,
    yScale: ScaleLinear<number, number, never>
  ) =>
    d3
      .area<TimescaleIntervalData>()
      // .defined(d => !isNaN(valueFn(d)))
      .x((d) => xScale(d.day))
      .y0(yScale(0))
      .y1((d) => {
        // console.log("y of", d, valueFn(d), y(valueFn(d)));
        return yScale(valueFn(d));
      });

  const yMax = d3.max(timescaleData, valueFn); // TODO - something better than max?
  if (yMax == undefined) {
    throw new Error("No maximum timescale");
  }

  const dateRange = d3.extent(timescaleData, (d) => d.day);
  if (dateRange[0] === undefined || dateRange[1] === undefined) {
    throw new Error("No date range in timescale data");
  }
  dateRange[0] = addUtcDays(dateRange[0], -7);
  dateRange[1] = addUtcDays(dateRange[1], 7);

  const xScale: ScaleTime<number, number, never> = scaleUtc()
    .domain(dateRange)
    .range([margin.left, width - margin.right, width]);
  const yScale: ScaleLinear<number, number, never> = scaleLinear()
    .domain([0, yMax])
    .range([height - margin.bottom, margin.top]);

  const xAxis = (
    g: Selection<SVGGElement, null, SVGSVGElement, unknown>,
    xScale: ScaleTime<number, number, never>,
    height: number
  ) =>
    g.attr("transform", `translate(0,${height - margin.bottom})`).call(
      axisBottom(xScale)
        .ticks(width / 80)
        .tickSizeOuter(0)
    );

  const brush = brushX<TimescaleIntervalData>()
    .extent([
      [margin.left, 0.5],
      [width - margin.right, height - margin.bottom + 0.5],
    ])
    .on("end", function ({ selection }: { selection: [number, number] }) {
      if (selection) {
        const [startDate, endDate] = selection
          .map((x: number) => xScale.invert(x))
          .map(dateToUnix);
        if (
          startDate !== undefined &&
          endDate !== undefined &&
          (startDate !== earliest || endDate !== latest)
        ) {
          dispatch({ type: "setDateRange", payload: [startDate, endDate] });
        }
      }
    });

  const selection: [number, number] = [
    xScale(unixToDate(earliest)),
    xScale(unixToDate(latest)),
  ];

  // update or draw x axis - using join as an experiment so we don't keep appending new axes on redraw
  svg
    .selectAll("g.x-axis")
    .data([null])
    .join((enter) =>
      enter.append("g").classed("x-axis", true).call(xAxis, xScale, height)
    );

  svg
    .selectAll("path.graph")
    .data([timescaleData])
    .join((enter) => enter.append("path").classed("graph", true))
    .attr("fill", "steelblue")
    .attr("d", area(xScale, yScale));

  svg
    .selectAll<SVGGElement, null>("g.brush")
    // TODO: UPGRADE: why why why?
    // examples use [null] but that doesn't type check
    .data([null] as unknown as TimescaleIntervalData[])
    .join((enter) => enter.append("g").classed("brush", true).call(brush))
    .call(brush.move, selection);
}

// see https://stackoverflow.com/questions/53446020/how-to-compare-oldvalues-and-newvalues-on-react-hooks-useeffect
function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const updateBodyTheme = (newTheme: string) => {
  document.body.dataset.theme = newTheme;
};

const Viz = ({ dataRef, state, dispatch }: DefaultProps) => {
  const d3TimescaleContainer: RefObject<SVGSVGElement | null> =
    useRef<SVGSVGElement | null>(null);
  const vizContainerRef: RefObject<HTMLElement | null> =
    useRef<HTMLElement | null>(null);
  const vizTooltipRef: RefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null);

  // Stable for the component's lifetime: every field is a ref, and useRef never changes identity.
  const refs = useRef<VizRefs>({
    overlaySvg: { current: null },
    glCanvas: { current: null },
    chartStack: { current: null },
    camera: { current: null },
    glRenderer: { current: null },
    visibleNodes: { current: null },
    outlineNodes: { current: null },
  }).current;

  // A full redraw bound to the latest data and state, refreshed by the main effect below. The GL
  // context-loss handler needs to rebuild everything from scratch, but it is registered once and
  // so can't close over either.
  const redrawAllRef = useRef<(() => void) | null>(null);

  const debouncedDispatch = useMemo(
    () => _.debounce((nextValue) => dispatch(nextValue), 250),
    [dispatch] // will be created only once
  );

  const prevState = usePrevious(state);

  // Releases the GL context's buffers and programs on unmount - `draw()` creates the renderer
  // lazily on the ref, so there's nothing to clean up if it was never mounted. Empty deps: this
  // must run its cleanup exactly once, on unmount, not after every render.
  useEffect(() => {
    return () => {
      // refs.glRenderer.current is set imperatively by draw() outside React's render cycle
      // (CLAUDE.md: react-hooks/refs is off repo-wide for the same reason), so reading it fresh
      // at unmount is correct, not stale.
      refs.glRenderer.current?.destroy();
    };
  }, [refs]);

  useEffect(() => {
    const {
      metadata: { timescaleData },
      metadata,
      data,
    } = dataRef.current;
    const { config, expensiveConfig, couplingConfig } = state;
    const { features } = data;
    redrawAllRef.current = () =>
      draw(refs, data.tree, metadata, features, state, dispatch);
    if (
      prevState === undefined ||
      !_.isEqual(prevState.expensiveConfig, expensiveConfig)
    ) {
      console.log("expensive config change - rebuild all");
      console.time("redraw");
      draw(refs, data.tree, metadata, features, state, dispatch);
      console.timeEnd("redraw");
      console.time("redrawTimescale");
      drawTimescale(
        d3TimescaleContainer,
        timescaleData,
        features,
        state,
        debouncedDispatch
      );
      console.timeEnd("redrawTimescale");
      updateBodyTheme(state.config.colours.currentTheme);
    } else {
      if (!_.isEqual(prevState.config, config)) {
        const nestingOnlyChange = isNestingOnlyChange(prevState.config, config);
        console.log(
          nestingOnlyChange
            ? "nesting-only change - uniform update"
            : "cheap config change - just redraw"
        );
        console.time("update");
        update(refs, metadata, features, state, nestingOnlyChange);
        console.timeEnd("update");
        if (
          prevState.config.colours.currentTheme !==
          state.config.colours.currentTheme
        ) {
          updateBodyTheme(state.config.colours.currentTheme);
        }
      }
      if (!_.isEqual(prevState.couplingConfig, couplingConfig)) {
        console.log("coupling change");
        console.time("update coupling");
        updateCoupling(refs, data.tree, metadata, state, dispatch);
        console.timeEnd("update coupling");
      }
    }
  }, [dataRef, state, dispatch, debouncedDispatch, prevState, refs]);

  // Re-fit on resize or a DPR change, then redraw the existing geometry at the new transform - no
  // rebuild needed. The overlay SVG's own viewBox re-fits itself natively; nothing to do there.
  // Skips until the first `draw()` has created the renderer, and keeps the user's current zoom.
  //
  // ResizeObserver alone isn't enough: dragging the window to a monitor with a different pixel
  // ratio changes the DPR without changing the CSS box, so the canvas would keep its old
  // backing-store resolution and render soft. `matchMedia` on the current ratio fires exactly when
  // it stops matching, and is re-armed on the new ratio each time.
  useEffect(() => {
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
  }, [dataRef, refs]);

  // A lost GL context takes every buffer, program and texture with it, and the canvas stays blank
  // with no error unless we rebuild. preventDefault() on the loss event is what makes the browser
  // promise a restore; on restore the old GlRenderer's handles are all dead, so drop it and let
  // draw() build a new one against the same canvas.
  useEffect(() => {
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
  }, [refs]);

  // The canvas owns pointer events (see main_areas.scss - the overlay is pointer-events: none
  // except .coupling). A native listener rather than a React `onClick` prop because `screenToWorld`
  // and `pick` both need the *current* camera/renderer, which live in refs, not props or state -
  // this is attached once and reads `.current` fresh on every click.
  useEffect(() => {
    const canvas = refs.glCanvas.current;
    if (!canvas) return;

    const handleClick = (event: MouseEvent) => {
      const camera = refs.camera.current;
      const glRenderer = refs.glRenderer.current;
      if (!camera || !glRenderer) return;
      const rect = canvas.getBoundingClientRect();
      const [worldX, worldY] = screenToWorld(
        camera,
        event.clientX - rect.left,
        event.clientY - rect.top
      );
      const picked = glRenderer.pick(worldX, worldY);
      if (picked) {
        dispatch({ type: "selectNode", payload: picked.data.path });
      }
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [dispatch, refs]);

  // Hover tooltip. Picking on every raw `mousemove` would run a quadtree search on every pixel the
  // cursor crosses; instead the latest event is stashed in a ref and a single `pick()` runs once
  // per animation frame (`rafId` guards against scheduling more than one). The DOM is only touched
  // when the picked node's path actually changes - sweeping the mouse across one large cell
  // shouldn't touch the DOM every frame - but the tooltip still tracks the cursor position on
  // every throttled tick, since it must move even while the picked node stays the same.
  useEffect(() => {
    const canvas = refs.glCanvas.current;
    const tooltip = vizTooltipRef.current;
    const container = vizContainerRef.current;
    if (!canvas || !tooltip || !container) return;

    let rafId: number | null = null;
    let lastEvent: MouseEvent | null = null;
    let lastPath: string | null = null;

    const updateTooltip = () => {
      rafId = null;
      const event = lastEvent;
      if (!event) return;
      const camera = refs.camera.current;
      const glRenderer = refs.glRenderer.current;
      if (!camera || !glRenderer) return;

      const canvasRect = canvas.getBoundingClientRect();
      const [worldX, worldY] = screenToWorld(
        camera,
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top
      );
      const picked = glRenderer.pick(worldX, worldY);
      const path = picked?.data.path ?? null;

      if (path !== lastPath) {
        lastPath = path;
        tooltip.hidden = path === null;
        if (path !== null) {
          tooltip.textContent = path;
        }
      }
      if (path !== null) {
        const containerRect = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - containerRect.left}px`;
        tooltip.style.top = `${event.clientY - containerRect.top}px`;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      lastEvent = event;
      if (rafId === null) {
        rafId = requestAnimationFrame(updateTooltip);
      }
    };

    const handleMouseLeave = () => {
      lastEvent = null;
      lastPath = null;
      tooltip.hidden = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [refs]);

  return (
    <aside className="Viz" ref={vizContainerRef}>
      <div className="chart-stack" ref={refs.chartStack}>
        <canvas className="chart-gl" ref={refs.glCanvas} />
        <svg className="chart-overlay" ref={refs.overlaySvg}>
          <defs>
            {/* arrowhead marker definition */}
            <marker
              id="arrow"
              viewBox="0 0 4 4"
              refX="2"
              refY="2"
              markerWidth="5"
              markerHeight="5"
              markerUnits="strokeWidth"
              // xoverflow="visible"  TODO: this was here and invalid - check
              overflow="visible"
              orient="auto-start-reverse"
            >
              <path d="M0,0L4,2L0,4z" fill="#ff6300" />
            </marker>
          </defs>
          <g className="topGroup" />
        </svg>
      </div>
      <VizTooltip ref={vizTooltipRef} />
      <svg className="timescale" ref={d3TimescaleContainer} />
    </aside>
  );
};

export default Viz;
