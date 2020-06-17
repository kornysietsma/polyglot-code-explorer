/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import {
  nodeAge,
  nodeCumulativeLinesOfCode,
  nodeDepth,
  nodeIndentationFn,
  nodeLocData,
  nodeNumberOfChangers,
  nodeChurnFn
} from "./nodeData";
import { numberOfChangersScale } from "./ColourScales";

function buildLanguageFn(languages, config) {
  const { languageMap } = languages;
  return d => {
    const loc = nodeLocData(d);
    if (!loc) {
      return config.colours.neutralColour;
    }
    return languageMap[loc.language].colour;
  };
}

function buildGoodBadUglyFnDetailed(dataFn, parentFn, config, good, bad, ugly) {
  const {
    goodColour,
    badColour,
    uglyColour,
    neutralColour,
    circlePackBackground
  } = config.colours;

  const goodBadUglyScale = d3
    .scaleLinear()
    .domain([good, bad, ugly])
    .range([goodColour, badColour, uglyColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);
  return d => {
    if (d.data.layout.algorithm === "circlePack") return circlePackBackground;
    const value = d.children ? parentFn(d) : dataFn(d);

    return value === undefined ? neutralColour : goodBadUglyScale(value);
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
  const { neutralColour, circlePackBackground } = config.colours;

  const scale = numberOfChangersScale(config);
  return d => {
    if (d.data.layout.algorithm === "circlePack") return circlePackBackground;
    if (d.children) return neutralColour; // no changers yet for dirs

    const value = nodeNumberOfChangers(
      d,
      expensiveConfig.dateRange.earliest,
      expensiveConfig.dateRange.latest
    );

    return value === undefined ? neutralColour : scale(value);
  };
}

function buildDepthColourFn(depthFn, config, stats) {
  const { neutralColour, circlePackBackground } = config.colours;
  const scale = d3
    .scaleSequential(d3.interpolatePlasma)
    .domain([0, stats.maxDepth])
    .clamp(true);
  return d => {
    if (d.data.layout.algorithm === "circlePack") return circlePackBackground;
    const value = depthFn(d);
    return value === undefined ? neutralColour : scale(value);
  };
}

function buildFillFunctions(config, expensiveConfig, stats, languages) {
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
      nodeAge,
      () => 0, // TODO: better parent handling
      config,
      "age"
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
  const {
    data,
    state,
    dispatch,
    state: { config, expensiveConfig, stats }
  } = props;

  const {
    metadata: { languages },
    files
  } = data.current;

  // TODO: should usePrevious include 'files' ? remove it and let's see.
  const prevState = usePrevious({ config, expensiveConfig });

  useEffect(() => {
    if (
      prevState === undefined ||
      prevState.expensiveConfig !== expensiveConfig
    ) {
      console.log("expensive config change - rebuild all");
      draw(d3Container, files, languages, state, dispatch);
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
    </aside>
  );
};

export default Viz;
