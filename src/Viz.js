/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import {
  nodeAge,
  nodeChurnFn,
  nodeCumulativeLinesOfCode,
  nodeDepth,
  nodeIndentationFn,
  nodeLocData,
  nodeNumberOfChangers,
  nodeCreationDate,
  nodeCreationDateClipped
} from "./nodeData";
import {
  numberOfChangersScale,
  earlyLateScale,
  goodBadUglyScale
} from "./ColourScales";
import { dateToUnix, unixToDate } from "./datetimes";

// overrides most other colours - mostly top-level circle packed background, and files that don't exist yet
// returns a colour, or undefined if there is no override
function overrideColourFunction(node, config) {
  const { nonexistentColour, circlePackBackground } = config.colours;
  const { latest } = config.dateRange;

  if (node.data.layout.algorithm === "circlePack") return circlePackBackground;
  const creationDate = nodeCreationDate(node);
  if (creationDate && creationDate > latest) return nonexistentColour;
  return undefined;
}

function buildLanguageFn(languages, config) {
  const { languageMap } = languages;
  return d => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const loc = nodeLocData(d);
    if (!loc) {
      return config.colours.neutralColour;
    }
    return languageMap[loc.language].colour;
  };
}

function buildEarlyLateFn(dataFn, parentFn, config, early, late) {
  const { neutralColour } = config.colours;

  const scale = earlyLateScale(config, early, late);

  return d => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const value = d.children ? parentFn(d) : dataFn(d);
    return value === undefined ? neutralColour : scale(value);
  };
}

function buildGoodBadUglyFnDetailed(dataFn, parentFn, config, good, bad, ugly) {
  const { neutralColour } = config.colours;

  const scale = goodBadUglyScale(config, good, bad, ugly);
  return d => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const value = d.children ? parentFn(d) : dataFn(d);

    return value === undefined ? neutralColour : scale(value);
  };
}

function buildGoodBadUglyFn(dataFn, parentFn, config, visualization) {
  const { good, bad, ugly } = config[visualization];
  return buildGoodBadUglyFnDetailed(dataFn, parentFn, config, good, bad, ugly);
}

function buildChurnFn(config, expensiveConfig) {
  const churnDataFn = nodeChurnFn(config, expensiveConfig);
  const { good, bad, ugly } = config.churn;

  return buildGoodBadUglyFnDetailed(
    churnDataFn,
    () => undefined, // TODO: better parenting
    config,
    good,
    bad,
    ugly
  );
}

function buildNumberOfChangersFn(config, expensiveConfig) {
  const { neutralColour } = config.colours;

  const scale = numberOfChangersScale(config);
  return d => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    if (d.children) return neutralColour; // no changers yet for dirs

    const value = nodeNumberOfChangers(
      d,
      config.dateRange.earliest,
      config.dateRange.latest
    );

    return value === undefined ? neutralColour : scale(value);
  };
}

function buildDepthColourFn(depthFn, config, stats) {
  const { neutralColour } = config.colours;
  const scale = d3
    .scaleSequential(d3.interpolatePlasma)
    .domain([0, stats.maxDepth])
    .clamp(true);
  return d => {
    const override = overrideColourFunction(d, config);
    if (override) return override;
    const value = depthFn(d);
    return value === undefined ? neutralColour : scale(value);
  };
}

function buildFillFunctions(config, expensiveConfig, stats, languages) {
  const {
    dateRange: { earliest, latest }
  } = config;
  return {
    loc: buildGoodBadUglyFn(
      nodeCumulativeLinesOfCode,
      () => undefined,
      config,
      "loc"
    ),
    depth: buildDepthColourFn(nodeDepth, config, stats),
    indentation: buildGoodBadUglyFn(
      nodeIndentationFn(config),
      () => undefined, // TODO: better parenting
      config,
      "indentation"
    ),
    age: buildGoodBadUglyFn(
      d => nodeAge(d, earliest, latest),
      () => 0, // TODO: better parent handling
      config,
      "age"
    ),
    creation: buildEarlyLateFn(
      d => nodeCreationDateClipped(d, earliest, latest),
      () => undefined,
      config,
      earliest,
      latest
    ),
    language: buildLanguageFn(languages, config),
    numberOfChangers: buildNumberOfChangersFn(config, expensiveConfig),
    churn: buildChurnFn(config, expensiveConfig)
  };
}

const redrawPolygons = (svgSelection, files, languages, state) => {
  const { config, expensiveConfig, stats } = state;

  const fillFunctions = buildFillFunctions(
    config,
    expensiveConfig,
    stats,
    languages
  );

  const fillFn = fillFunctions[config.visualization];
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

const update = (d3Container, files, languages, state) => {
  if (!d3Container.current) {
    throw Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  redrawPolygons(svg.selectAll(".cell"), files, languages, state);

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

  // redrawSelection(svg.selectAll(".selected"), data, state);
};

const draw = (d3Container, files, languages, state, dispatch) => {
  const { config, expensiveConfig } = state;

  if (!d3Container.current) {
    console.warn("in draw but d3container not yet current");
    return;
  }
  const vizEl = d3Container.current;
  // console.log(vizEl);
  const w = vizEl.clientWidth;
  const h = vizEl.clientHeight;
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

  const newNodes = nodes
    .enter()
    .append("path")
    .classed("cell", true);

  redrawPolygons(nodes.merge(newNodes), files, languages, state)
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
    dateRange: { earliest, latest }
  } = config;

  console.log("draw timescale dates", earliest, latest);

  const margin = { left: 5, right: 5, bottom: 20, top: 10 };
  const height = 100;

  if (!d3TimescaleContainer.current) {
    console.warn("in drawTimescale but d3TimescaleContainer not yet current");
    return;
  }
  const vizEl = d3TimescaleContainer.current;
  // console.log(vizEl);
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
    .on("brush", () => {
      console.log("brush ignored");
    })
    .on("end", () => {
      if (d3.event.selection) {
        console.log("Updating date range?");
        const [startDate, endDate] = d3.event.selection
          .map(x => xScale.invert(x))
          .map(dateToUnix);
        if (startDate !== earliest || endDate !== latest) {
          // console.log("Date change", startDate, endDate, earliest, latest);
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
    .selectAll("path.foo")
    .data([timescaleData])
    .join(enter => enter.append("path").classed("foo", true))
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
    metadata: { languages, timescaleData },
    files
  } = data.current;

  const prevState = usePrevious({ config, expensiveConfig });

  useEffect(() => {
    if (
      prevState === undefined ||
      prevState.expensiveConfig !== expensiveConfig
    ) {
      console.log("expensive config change - rebuild all");
      draw(d3Container, files, languages, state, dispatch);
      drawTimescale(d3TimescaleContainer, timescaleData, state, dispatch);
    } else if (prevState.config !== config) {
      console.log("cheap config change - just redraw");
      update(d3Container, files, languages, state);
    } else {
      console.log("no change in visible config - not doing nothing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, state]);

  return (
    <aside className="Viz">
      <svg ref={d3Container}>
        <g className="topGroup" />
      </svg>
      <svg ref={d3TimescaleContainer} />
    </aside>
  );
};

export default Viz;
