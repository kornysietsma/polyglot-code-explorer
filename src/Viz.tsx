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
  nodeCenter,
  nodeCircleAncestors,
  nodeCouplingFilesFiltered,
  nodeDescendants,
  nodeHasCouplingData,
  nodePath,
} from "./nodeData";
import { FeatureFlags, Point, TreeNode } from "./polyglot_data.types";
import { TimescaleIntervalData } from "./preprocess";
import { Action, colourKeyToColours, State, themedColours } from "./state";
import { getCurrentVis } from "./VisualizationData";
import { VizMetadata } from "./viz.types";
import VizTooltip from "./VizTooltip";
import {
  Camera,
  fitTransform,
  IDENTITY_ZOOM,
  overlayGroupTransform,
  screenToWorld,
} from "./webgl/camera";
import { resolvePatternFallback } from "./webgl/colours";
import { GlRenderer } from "./webgl/GlRenderer";

// Builds the per-node fill-colour function the WebGL renderer uploads as its colour buffer:
// the current visualisation's own fillFn, with `url(#patternN)` (TeamPatternVisualization)
// resolved down to a flat colour via colours.ts's step-3 fallback. Replaces the SVG-era
// `redrawPolygons`, which set this as a `.cell` path's `fill` style directly.
function buildFillFn(
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State
): (d: HierarchyNode<TreeNode>) => string {
  const visualization = getCurrentVis(state.config).buildVisualization(
    state,
    metadata,
    features,
    undefined
  );
  const { svgPatternIds } = state.calculated.svgPatterns;
  return (d) => resolvePatternFallback(visualization.fillFn(d), svgPatternIds);
}

const redrawNesting = (
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
    const nesting = d.depth - (nodeCircleAncestors(d.data) + 1);
    if (nesting < 0) return 0;
    if (nesting >= config.nesting.nestedWidths.length)
      return config.nesting.defaultWidth;
    return config.nesting.nestedWidths[nesting] || config.nesting.defaultWidth;
  };

  const strokeColourFn = (d: HierarchyNode<TreeNode>) => {
    const nesting = d.depth - (nodeCircleAncestors(d.data) + 1);
    const theme = themedColours(config);

    if (nesting < 0) return 0;
    if (nesting >= theme.nestedStrokes.length) return theme.defaultStroke;
    return theme.nestedStrokes[nesting] || theme.defaultStroke;
  };

  return svgSelection
    .attr("d", (d) => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("fill", "none")
    .style("stroke", strokeColourFn)
    .style("stroke-width", strokeWidthFn)
    .style("vector-effect", "non-scaling-stroke"); // so zooming doesn't make thick lines
};

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
  d3Container: React.RefObject<SVGSVGElement | null>,
  glCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  cameraRef: React.RefObject<Camera | null>,
  glRendererRef: React.RefObject<GlRenderer | null>,
  visibleNodesRef: React.RefObject<HierarchyNode<TreeNode>[] | null>,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State
) => {
  if (!d3Container.current) {
    throw new Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  // if (!svg instanceof SVGElement) {
  //   throw new Error("Invalid root SVG element");
  // }
  const glCanvas = glCanvasRef.current;
  const camera = cameraRef.current;
  const glRenderer = glRendererRef.current;
  const visibleNodes = visibleNodesRef.current;
  if (!glCanvas || !camera || !glRenderer || !visibleNodes) {
    throw new Error(
      "update called before draw, so the WebGL renderer is not ready"
    );
  }
  // Naive routing (plan.md step 4): any config change rebuilds both buffers, even though only
  // colours changed here. Fixed in step 8, once GlRenderer exposes setColours() separately.
  glRenderer.setGeometry(visibleNodes, buildFillFn(metadata, features, state));
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  redrawNesting(svg.selectAll(".nesting"), state);

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
    const from = nodePath(d.source);
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
  d3Container: React.RefObject<SVGSVGElement | null>,
  files: TreeNode,
  metadata: VizMetadata,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  if (!d3Container.current) {
    throw new Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  const group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown> =
    svg.selectAll(".topGroup");
  drawCoupling(group, files, metadata, state, dispatch);
};

// Resizes a canvas's backing store to match its CSS box at the current DPR. CSS size itself
// stays declarative (100%/100% in main_areas.scss) - only the device-pixel resolution is set
// here, per plan.md's "DPR and resize".
function resizeCanvasToDisplaySize(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number
) {
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}

const draw = (
  d3Container: React.RefObject<SVGSVGElement | null>,
  glCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  chartStackRef: React.RefObject<HTMLDivElement | null>,
  cameraRef: React.RefObject<Camera | null>,
  glRendererRef: React.RefObject<GlRenderer | null>,
  visibleNodesRef: React.RefObject<HierarchyNode<TreeNode>[] | null>,
  files: TreeNode,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  const { config, expensiveConfig } = state;
  const {
    layout: { timescaleHeight },
  } = config;

  if (!d3Container.current) {
    console.warn("in draw but d3container not yet current");
    return;
  }
  const chartStackEl = chartStackRef.current;
  const glCanvas = glCanvasRef.current;
  if (!chartStackEl || !glCanvas) {
    console.warn("in draw but canvas layer not yet mounted");
    return;
  }
  const vizEl = d3Container.current;
  const w = chartStackEl.clientWidth;
  const boxHeight = chartStackEl.clientHeight;
  const h = boxHeight - timescaleHeight;

  const { layout } = files;
  if (!layout.width || !layout.height) {
    throw new Error("Root node has no width or height!");
  }

  const dpr = window.devicePixelRatio || 1;
  const fit = fitTransform(
    { width: layout.width, height: layout.height },
    w,
    boxHeight
  );
  const camera: Camera = { fit, zoom: IDENTITY_ZOOM, dpr };
  cameraRef.current = camera;
  resizeCanvasToDisplaySize(glCanvas, w, boxHeight, dpr);
  if (!glRendererRef.current) {
    glRendererRef.current = new GlRenderer(glCanvas);
  }
  const glRenderer = glRendererRef.current;

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

  // note we filter out nodes that are parents who will be hidden by their children, for speed
  // so only show parent nodes at the clipping level.
  const allNodes = rootNode
    .descendants()
    .filter((d) => d.depth <= expensiveConfig.depth)
    .filter(
      (d) => d.children === undefined || d.depth === expensiveConfig.depth
    );

  visibleNodesRef.current = allNodes;
  glRenderer.setGeometry(allNodes, buildFillFn(metadata, features, state));
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  const nestingNodes = rootNode
    .descendants()
    .filter(
      (d) =>
        d.depth >= 1 + nodeCircleAncestors(d.data) &&
        d.depth <= state.expensiveConfig.depth
    )
    .sort((left, right) => right.depth - left.depth);

  const nestingNodesSelection = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".nesting")
    .data(nestingNodes, function (node) {
      return node.data.path;
    });
  const newNestingNodes = nestingNodesSelection
    .enter()
    .append("path")
    .classed("nesting", true);
  // No click handler here (plan.md step 5): the overlay is pointer-events: none now that the
  // canvas does picking, and directory-border clicks are dropped deliberately (spec.md
  // decision 3) rather than replaced with an equivalent on the canvas.
  redrawNesting(nestingNodesSelection.merge(newNestingNodes), state);

  nestingNodesSelection.exit().remove();

  // TODO

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
  // it - which is why the camera composes fit *then* zoom (camera.ts) - and it stays the right
  // target regardless of which layer currently has pointer-events (canvas.chart-gl gets that
  // switch in step 5), so d3.zoom never needs to move again.
  const zoomed = (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
    const nextCamera: Camera = {
      ...camera,
      zoom: {
        x: event.transform.x,
        y: event.transform.y,
        k: event.transform.k,
      },
    };
    cameraRef.current = nextCamera;

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
  const d3Container: RefObject<SVGSVGElement | null> =
    useRef<SVGSVGElement | null>(null);
  const d3TimescaleContainer: RefObject<SVGSVGElement | null> =
    useRef<SVGSVGElement | null>(null);
  const glCanvasRef: RefObject<HTMLCanvasElement | null> =
    useRef<HTMLCanvasElement | null>(null);
  const chartStackRef: RefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null);
  const cameraRef: RefObject<Camera | null> = useRef<Camera | null>(null);
  const glRendererRef: RefObject<GlRenderer | null> = useRef<GlRenderer | null>(
    null
  );
  const visibleNodesRef: RefObject<HierarchyNode<TreeNode>[] | null> = useRef<
    HierarchyNode<TreeNode>[] | null
  >(null);
  const vizContainerRef: RefObject<HTMLElement | null> =
    useRef<HTMLElement | null>(null);
  const vizTooltipRef: RefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null);

  const debouncedDispatch = useMemo(
    () => _.debounce((nextValue) => dispatch(nextValue), 250),
    [dispatch] // will be created only once
  );

  const prevState = usePrevious(state);

  useEffect(() => {
    const {
      metadata: { timescaleData },
      metadata,
      data,
    } = dataRef.current;
    const { config, expensiveConfig, couplingConfig } = state;
    const { features } = data;
    if (
      prevState === undefined ||
      !_.isEqual(prevState.expensiveConfig, expensiveConfig)
    ) {
      console.log("expensive config change - rebuild all");
      console.time("redraw");
      draw(
        d3Container,
        glCanvasRef,
        chartStackRef,
        cameraRef,
        glRendererRef,
        visibleNodesRef,
        data.tree,
        metadata,
        features,
        state,
        dispatch
      );
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
        console.log("cheap config change - just redraw");
        console.time("update");
        update(
          d3Container,
          glCanvasRef,
          cameraRef,
          glRendererRef,
          visibleNodesRef,
          metadata,
          features,
          state
        );
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
        updateCoupling(d3Container, data.tree, metadata, state, dispatch);
        console.timeEnd("update coupling");
      }
    }
  }, [dataRef, state, dispatch, debouncedDispatch, prevState]);

  // Resize handling: re-fit the camera and the canvas's backing-store resolution, then redraw
  // the existing geometry at the new transform - no rebuild needed, per spec.md's "DPR and
  // resize". The overlay SVG's own viewBox re-fits itself natively; nothing to do there. Skips
  // until the first `draw()` has created the renderer.
  useEffect(() => {
    const stackEl = chartStackRef.current;
    const canvas = glCanvasRef.current;
    if (!stackEl || !canvas) return;

    const observer = new ResizeObserver(() => {
      const glRenderer = glRendererRef.current;
      if (!glRenderer) return;
      const { layout } = dataRef.current.data.tree;
      if (!layout.width || !layout.height) return;
      const dpr = window.devicePixelRatio || 1;
      const w = stackEl.clientWidth;
      const boxHeight = stackEl.clientHeight;
      const fit = fitTransform(
        { width: layout.width, height: layout.height },
        w,
        boxHeight
      );
      const zoom = cameraRef.current?.zoom ?? IDENTITY_ZOOM;
      const camera: Camera = { fit, zoom, dpr };
      cameraRef.current = camera;
      resizeCanvasToDisplaySize(canvas, w, boxHeight, dpr);
      glRenderer.setTransform(camera, canvas.width, canvas.height);
      glRenderer.draw();
    });
    observer.observe(stackEl);
    return () => observer.disconnect();
  }, [dataRef]);

  // Click-to-select (plan.md step 5): the canvas now owns pointer events (see main_areas.scss -
  // the overlay is pointer-events: none except .coupling), so this replaces the old .cell click
  // handler. A native listener rather than a React `onClick` prop because `screenToWorld` and
  // `pick` both need the *current* camera/renderer, which live in refs, not props or state - this
  // is attached once and reads `.current` fresh on every click. Same dispatched action as before.
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    const handleClick = (event: MouseEvent) => {
      const camera = cameraRef.current;
      const glRenderer = glRendererRef.current;
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
  }, [dispatch]);

  // Hover tooltip (plan.md step 6): replaces the SVG-era per-node `<title>`. Picking on every
  // raw `mousemove` would run a quadtree search on every pixel the cursor crosses; instead the
  // latest event is stashed in a ref and a single `pick()` runs once per animation frame
  // (`rafId` guards against scheduling more than one), which is what spec.md's "Interaction"
  // section calls for. The DOM is only touched when the picked node's path actually changes -
  // sweeping the mouse across one large cell shouldn't touch the DOM every frame - but the
  // tooltip still tracks the cursor position on every throttled tick, since it must move even
  // while the picked node stays the same.
  useEffect(() => {
    const canvas = glCanvasRef.current;
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
      const camera = cameraRef.current;
      const glRenderer = glRendererRef.current;
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
  }, []);

  function svgPatternDefs() {
    const { svgPatternIds } = state.calculated.svgPatterns;
    const { neutralColour } = themedColours(state.config);
    /* sample
        <linearGradient id="diagonalHatch" gradientUnits="userSpaceOnUse"
                    x2="30" spreadMethod="repeat" gradientTransform="rotate(-45)">
      <stop offset="0" stop-color="orange"/>
      <stop offset="0.33" stop-color="orange"/>
      <stop offset="0.33" stop-color="blue"/>
      <stop offset="0.67" stop-color="blue"/>
      <stop offset="0.67" stop-color="red"/>
      <stop offset="1.0" stop-color="red"/>
    </linearGradient>
    */
    return [...svgPatternIds].map(([colourKey, patternId]) => {
      const colours = colourKeyToColours(colourKey);
      if (
        colours.length == 3 &&
        colours[2] == colours[1] &&
        colours[1] == colours[0]
      ) {
        // solid colour - build a simpler gradient
        return (
          <linearGradient key={patternId} id={`pattern${patternId}`}>
            <stop stopColor={colours[0]} />
          </linearGradient>
        );
      } else {
        return (
          <linearGradient
            key={patternId}
            id={`pattern${patternId}`}
            gradientUnits="userSpaceOnUse"
            x2="10"
            spreadMethod="repeat"
            gradientTransform="rotate(-45)"
          >
            <stop offset="0" stopColor={colours[0]} />
            <stop offset="0.33" stopColor={colours[0]} />
            <stop offset="0.33" stopColor={colours[1] ?? neutralColour} />
            <stop offset="0.67" stopColor={colours[1] ?? neutralColour} />
            <stop offset="0.67" stopColor={colours[2] ?? neutralColour} />
            <stop offset="1.0" stopColor={colours[2] ?? neutralColour} />
          </linearGradient>
        );
      }
    });
  }

  return (
    <aside className="Viz" ref={vizContainerRef}>
      <div className="chart-stack" ref={chartStackRef}>
        <canvas className="chart-gl" ref={glCanvasRef} />
        <svg className="chart-overlay" ref={d3Container}>
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
            {state.config.visualization == "teamPattern" ? (
              svgPatternDefs()
            ) : (
              <></>
            )}
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
