/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { dateToUnix, unixToDate } from "./datetimes";
import VisualizationData from "./visualizationData";

// TODO: should this live in Visualization.js ?
function getCurrentVis(config) {
  const vis = VisualizationData[config.visualization];

  let selected = vis;
  if (vis.subVis) {
    if (config.subVis) {
      selected = vis.children[config.subVis];
    } else {
      // can this happen?
      console.warn("No config.subVis selected - using default");
      selected = vis.children[vis.defaultChild];
    }
  }
  return selected;
}

const redrawPolygons = (svgSelection, files, metadata, state) => {
  const { config, expensiveConfig, stats } = state;

  const { fillFnBuilder, colourScaleBuilder, dataFn, parentFn } = getCurrentVis(
    config
  );
  const scale = colourScaleBuilder(config, metadata, stats);
  const fillFn = fillFnBuilder(config, scale, dataFn, parentFn);

  const strokeWidthFn = d => {
    if (d.data.layout.algorithm === "circlePack") return 0;
    return d.depth < 4 ? 4 - d.depth : 1;
  };

  return svgSelection
    .attr("d", d => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("fill", fillFn)
    .style("stroke", config.colours.defaultStroke)
    .style("stroke-width", strokeWidthFn)
    .style("vector-effect", "non-scaling-stroke"); // so zooming doesn't make thick lines
};

const redrawSelection = (svgSelection, files, state) => {
  const { config, stats } = state;

  const strokeWidthFn = d => {
    if (d.data.layout.algorithm === "circlePack") return 0;
    return d.depth < 4 ? 4 - d.depth : 1;
  };

  return svgSelection
    .attr("d", d => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("stroke-width", strokeWidthFn)
    .style("stroke", config.colours.selectedStroke)
    .style("fill", "none")
    .style("vector-effect", "non-scaling-stroke"); // so zooming doesn't make thick lines
};

function findSelectionPath(data, state) {
  if (!state.config.selectedNode) return [];
  let node = state.config.selectedNode;
  const results = [];
  while (node.parent) {
    results.push(node);
    node = node.parent;
  }
  results.push(node);
  return results.reverse();
}

const update = (d3Container, files, metadata, state) => {
  if (!d3Container.current) {
    throw Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  redrawPolygons(svg.selectAll(".cell"), files, metadata, state);

  // TODO: DRY this up - or should selecting just be expensive config?
  const selectionPath = findSelectionPath(files, state);
  const group = svg.selectAll(".topGroup");
  const selectionNodes = group
    .selectAll(".selected")
    .data(selectionPath, node => node.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), files, state);
  selectionNodes.exit().remove();
};

const draw = (d3Container, files, metadata, state, dispatch) => {
  const { config, expensiveConfig } = state;
  const {
    layout: { timescaleHeight }
  } = config;

  if (!d3Container.current) {
    console.warn("in draw but d3container not yet current");
    return;
  }
  const vizEl = d3Container.current;
  const w = vizEl.clientWidth;
  const h = vizEl.clientHeight - timescaleHeight;

  const { layout } = files;
  const svg = d3
    .select(vizEl)
    .attr("viewBox", [
      -layout.width / 2,
      -layout.height / 2,
      layout.width,
      layout.height
    ]);
  const group = svg.selectAll(".topGroup");
  const rootNode = d3.hierarchy(files); // .sum(d => d.value);

  // note we filter out nodes that are parents who will be hidden by their children, for speed
  // so only show parent nodes at the clipping level.
  const allNodes = rootNode
    .descendants()
    .filter(d => d.depth <= expensiveConfig.depth)
    .filter(d => d.children === undefined || d.depth === expensiveConfig.depth);

  const nodes = group
    .datum(rootNode)
    .selectAll(".cell")
    .data(allNodes, node => node.path);

  // TODO - consider reworking this with d3.join which seems to be the new hotness?
  const newNodes = nodes
    .enter()
    .append("path")
    .classed("cell", true);

  redrawPolygons(nodes.merge(newNodes), files, metadata, state)
    // eslint-disable-next-line no-unused-vars
    .on("click", (node, i, nodeList) => {
      // console.log("onClicked", node, i, nodeList[i]);
      dispatch({ type: "selectNode", payload: node });
    })
    .append("svg:title")
    .text(n => n.data.path);

  nodes.exit().remove();

  const selectionPath = findSelectionPath(files, state);
  const selectionNodes = group
    .selectAll(".selected")
    .data(selectionPath, node => node.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), files, state);

  selectionNodes.exit().remove();

  // zooming - see https://observablehq.com/@d3/zoomable-map-tiles?collection=@d3/d3-zoom
  const zoomed = () => {
    group.attr("transform", d3.event.transform);
  };

  svg.call(
    d3
      .zoom()
      .extent([
        [0, 0],
        [w, h]
      ])
      .scaleExtent([0.5, 8])
      .on("zoom", zoomed)
  );
};

function drawTimescale(d3TimescaleContainer, timescaleData, state, dispatch) {
  const { config, expensiveConfig } = state;
  const {
    dateRange: { earliest, latest },
    layout: { timescaleHeight }
  } = config;

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

  const valueFn = d => d.commits; // abstracted so we can pick a differnt one

  // we might simplify these, from an overly generic example
  const area = (x, y) =>
    d3
      .area()
      // .defined(d => !isNaN(valueFn(d)))
      .x(d => x(d.day))
      .y0(y(0))
      .y1(d => {
        // console.log("y of", d, valueFn(d), y(valueFn(d)));
        return y(valueFn(d));
      });

  const yMax = d3.max(timescaleData, valueFn);

  const xScale = d3
    .scaleUtc()
    .domain(d3.extent(timescaleData, d => d.day))
    .range([margin.left, width - margin.right, width]);
  const yScale = d3
    .scaleLinear()
    .domain([0, yMax])
    .range([height - margin.bottom, margin.top]);

  const xAxis = (g, x, h) =>
    g.attr("transform", `translate(0,${h - margin.bottom})`).call(
      d3
        .axisBottom(x)
        .ticks(width / 80)
        .tickSizeOuter(0)
    );

  const brush = d3
    .brushX()
    .extent([
      [margin.left, 0.5],
      [width - margin.right, height - margin.bottom + 0.5]
    ])
    // .on("brush", () => {
    //   console.log("brush ignored");
    // })
    .on("end", () => {
      if (d3.event.selection) {
        const [startDate, endDate] = d3.event.selection
          .map(x => xScale.invert(x))
          .map(dateToUnix);
        if (startDate !== earliest || endDate !== latest) {
          dispatch({ type: "setDateRange", payload: [startDate, endDate] });
        }
      }
    });

  const selection = [xScale(unixToDate(earliest)), xScale(unixToDate(latest))];

  // update or draw x axis - using join as an experiment so we don't keep appending new axes on redraw
  svg
    .selectAll("g.x-axis")
    .data([null])
    .join(enter =>
      enter
        .append("g")
        .classed("x-axis", true)
        .call(xAxis, xScale, height)
    );

  svg
    .selectAll("path.graph")
    .data([timescaleData])
    .join(enter => enter.append("path").classed("graph", true))
    .attr("fill", "steelblue")
    .attr("d", area(xScale, yScale));

  svg
    .selectAll("g.brush")
    .data([null])
    .join(enter =>
      enter
        .append("g")
        .classed("brush", true)
        .call(brush)
    )
    .call(brush.move, selection);
}

// see https://stackoverflow.com/questions/53446020/how-to-compare-oldvalues-and-newvalues-on-react-hooks-useeffect
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const Viz = props => {
  const d3Container = useRef(null);
  const d3TimescaleContainer = useRef(null);
  const {
    data,
    state,
    dispatch,
    state: { config, expensiveConfig, stats }
  } = props;

  const {
    metadata: { timescaleData },
    metadata,
    files
  } = data.current;

  const prevState = usePrevious({ config, expensiveConfig });

  useEffect(() => {
    if (
      prevState === undefined ||
      prevState.expensiveConfig !== expensiveConfig
    ) {
      console.log("expensive config change - rebuild all");
      draw(d3Container, files, metadata, state, dispatch);
      drawTimescale(d3TimescaleContainer, timescaleData, state, dispatch);
    } else if (prevState.config !== config) {
      console.log("cheap config change - just redraw");
      update(d3Container, files, metadata, state);
    } else {
      console.log("no change in visible config - not doing nothing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, state]);

  return (
    <aside className="Viz">
      <svg className="chart" ref={d3Container}>
        <g className="topGroup" />
      </svg>
      <svg className="timescale" ref={d3TimescaleContainer} />
    </aside>
  );
};

export default Viz;
