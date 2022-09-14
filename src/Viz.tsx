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
  nodeCouplingFilesFiltered,
  nodeDescendants,
  nodeHasCouplingData,
  nodePath,
} from "./nodeData";
import { Point, TreeNode } from "./polyglot_data.types";
import { TimescaleIntervalData } from "./preprocess";
import { Action, State, themedColours } from "./state";
import { getCurrentVis } from "./VisualizationData";
import { VizMetadata } from "./viz.types";

const redrawPolygons = (
  svgSelection: Selection<
    SVGPathElement,
    HierarchyNode<TreeNode>,
    SVGGElement,
    unknown
  >,
  metadata: VizMetadata,
  state: State
) => {
  const { config } = state;

  const visualization = getCurrentVis(config).buildVisualization(
    state,
    metadata
  );

  const strokeWidthFn = (d: HierarchyNode<TreeNode>) => {
    if (d.data.layout.algorithm === "circlePack") return 0;
    return d.depth < 4 ? 4 - d.depth : 1;
  };

  return svgSelection
    .attr("d", (d) => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("fill", (d) => visualization.fillFn(d))
    .style("stroke", themedColours(config).defaultStroke)
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
    if (d.data.layout.algorithm === "circlePack") return 0;
    return d.depth < 4 ? 4 - d.depth : 1;
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
  d3Container: React.RefObject<SVGSVGElement>,
  files: TreeNode,
  metadata: VizMetadata,
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
  redrawPolygons(svg.selectAll(".cell"), metadata, state);

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
    .text(couplingLabel); // so zooming doesn't make thick lines

  couplingNodes.exit().remove();
}

const updateCoupling = (
  d3Container: React.RefObject<SVGSVGElement>,
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

const draw = (
  d3Container: React.RefObject<SVGSVGElement>,
  files: TreeNode,
  metadata: VizMetadata,
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
  const vizEl = d3Container.current;
  const w = vizEl.clientWidth;
  const h = vizEl.clientHeight - timescaleHeight;

  const { layout } = files;
  if (!layout.width || !layout.height) {
    throw new Error("Root node has no width or height!");
  }

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

  const nodes = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".cell")
    .data(allNodes, function (node) {
      return node.data.path;
    });

  // TODO - consider reworking this with join which seems to be the new hotness?
  const newNodes = nodes.enter().append("path").classed("cell", true);

  redrawPolygons(nodes.merge(newNodes), metadata, state)
    // eslint-disable-next-line no-unused-vars
    .on(
      "click",
      function (
        this: SVGPathElement,
        event: PointerEvent,
        node: HierarchyNode<TreeNode>
      ) {
        dispatch({ type: "selectNode", payload: node.data.path });
      }
    )
    .append("svg:title")
    .text((n) => n.data.path);

  nodes.exit().remove();

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
  const zoomed = (
    event: D3ZoomEvent<SVGSVGElement, HierarchyNode<TreeNode>>
  ) => {
    group.attr("transform", event.transform.toString());
    //UPGRADE - does this work? Taken from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/d3-zoom/d3-zoom-tests.ts
  };

  svg.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .extent([
        [0, 0],
        [w, h],
      ])
      .scaleExtent([0.5, 16])
      .on("zoom", zoomed)
  );
};

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setTime(result.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

function drawTimescale(
  d3TimescaleContainer: React.RefObject<SVGSVGElement>,
  timescaleData: TimescaleIntervalData[],
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

  const valueFn = (d: TimescaleIntervalData) => d.commits; // abstracted so we can pick a differnt one

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
  dateRange[0] = addDays(dateRange[0], -1);
  dateRange[1] = addDays(dateRange[1], 1);

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
    // .on("brush", () => {
    //   console.log("brush ignored");
    // })
    .on("end", function ({ selection }: { selection: [number, number] }) {
      console.log("brush end");
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

  const selection = [xScale(unixToDate(earliest)), xScale(unixToDate(latest))];

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
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const updateBodyTheme = (newTheme: string) => {
  document.body.dataset.theme = newTheme;
};

const Viz = ({ dataRef, state, dispatch }: DefaultProps) => {
  const d3Container: RefObject<SVGSVGElement> = useRef(null);
  const d3TimescaleContainer: RefObject<SVGSVGElement> = useRef(null);

  const debouncedDispatch = useMemo(
    () => _.debounce((nextValue) => dispatch(nextValue), 250),
    [dispatch] // will be created only once
  );

  const prevState = usePrevious(state);

  useEffect(() => {
    const {
      metadata: { timescaleData },
      metadata,
      files,
    } = dataRef.current;
    const { config, expensiveConfig, couplingConfig } = state;
    if (
      prevState === undefined ||
      !_.isEqual(prevState.expensiveConfig, expensiveConfig)
    ) {
      console.log("expensive config change - rebuild all");
      draw(d3Container, files.tree, metadata, state, dispatch);
      drawTimescale(
        d3TimescaleContainer,
        timescaleData,
        state,
        debouncedDispatch
      );
      updateBodyTheme(state.config.colours.currentTheme);
    } else {
      if (!_.isEqual(prevState.config, config)) {
        console.log("cheap config change - just redraw");
        update(d3Container, files.tree, metadata, state);
        if (
          prevState.config.colours.currentTheme !==
          state.config.colours.currentTheme
        ) {
          updateBodyTheme(state.config.colours.currentTheme);
        }
      }
      if (!_.isEqual(prevState.couplingConfig, couplingConfig)) {
        console.log("coupling change");
        updateCoupling(d3Container, files.tree, metadata, state, dispatch);
      }
    }
  }, [dataRef, state, dispatch, debouncedDispatch, prevState]);

  return (
    <aside className="Viz">
      <svg className="chart" ref={d3Container}>
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
      <svg className="timescale" ref={d3TimescaleContainer} />
    </aside>
  );
};

export default Viz;
