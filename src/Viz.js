/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import * as vtm from "d3-voronoi-treemap";

const refreshSelection = (svg, data, config) => {
  const circles = svg.selectAll("circle").data(data.current);

  const newCircles = circles.enter().append("svg:circle");

  circles
    .merge(newCircles)
    .attr("r", d => `${(d.width * config.scale) / 200}px`)
    .style("fill", d => (d.color ? d.color : "purple"));

  circles.exit().remove();

  return circles; // for further effects
};

function flareWeightLoc(d) {
  if (d.data === undefined) return 0;
  if (d.data.loc === undefined) return 0;
  return d.data.loc.code;
}

function pruneWeightlessNodes(hierarchy) {
  if (hierarchy.children !== undefined) {
    // eslint-disable-next-line no-param-reassign
    hierarchy.children = hierarchy.children.filter(node => node.value > 0);
    hierarchy.children.forEach(child => pruneWeightlessNodes(child));
  }
}

// use getIn for objects as well as immutable objects
function nestedGet(object, path) {
  // if (Immutable.isImmutable(object)) {
  // return Immutable.getIn(object, path);
  // }
  let index = 0;
  const { length } = path;
  let o = object;

  while (o != null && index < length) {
    // eslint-disable-next-line no-plusplus
    o = o[path[index++]];
  }
  return index && index === length ? o : undefined;
}

function locDataFn(d) {
  return nestedGet(d, ["data", "data", "loc", "code"]);
}
function buildScaledNodeColourFn(
  dataFn,
  parentColour,
  defaultColour,
  colourScale
) {
  return d => {
    if (d.children) {
      return parentColour;
    }
    const value = dataFn(d);

    return value === undefined ? defaultColour : colourScale(value);
  };
}

function buildLocFillFn() {
  const parentFillColour = d3.rgb("#202020");
  const neutralColour = d3.rgb("green");
  const maxLoc = 1000;
  const colourScale = c => d3.interpolateRdYlGn(1.0 - c); // see https://github.com/d3/d3-scale-chromatic/blob/master/README.md
  // const goodestColour = colourScale(0);
  // const baddestColour = colourScale(1);
  const goodBadScale = d3.scaleSequential(colourScale).clamp(true);

  return buildScaledNodeColourFn(
    locDataFn,
    parentFillColour,
    neutralColour,
    goodBadScale.copy().domain([0, maxLoc])
  );
}

function computeCirclingPolygon(points, radius) {
  const increment = (2 * Math.PI) / points;
  const circlingPolygon = [];

  for (let a = 0, i = 0; i < points; i++, a += increment) {
    circlingPolygon.push([
      radius + radius * Math.cos(a),
      radius + radius * Math.sin(a)
    ]);
  }

  return circlingPolygon;
}

const update = (d3Container, data, state) => {
  const { config } = state;
  // console.log("Viz.update", data, config);
  if (!d3Container.current) {
    throw Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  refreshSelection(svg, data, config);
};

const draw = (d3Container, data, state) => {
  const { config, expensiveConfig } = state;
  // console.log("Viz.draw", data, config, expensiveConfig);

  if (!d3Container.current) {
    console.log("in draw but d3container not yet current");
    return;
  }
  const vizEl = d3Container.current;
  console.log(vizEl);
  const w = vizEl.clientWidth;
  const h = vizEl.clientHeight;
  const svg = d3.select(vizEl);
  console.log("svg w,h:", w, h);
  const rootNode = d3.hierarchy(data.current).sum(flareWeightLoc);
  console.log("hierarchy built");

  pruneWeightlessNodes(rootNode);

  const clipShape = computeCirclingPolygon(32, w / 2);

  const theMapper = vtm.voronoiTreemap().clip(clipShape);

  console.log("calculating voronoi treemap");
  theMapper(rootNode);

  console.log("drawing");

  const allNodes = rootNode.descendants();

  const locFillFn = buildLocFillFn();

  svg
    .selectAll("path")
    .data(allNodes)
    .enter()
    .append("path")
    .classed("cell", true)
    .attr("d", d => {
      return `${d3.line()(d.polygon)}z`;
    })
    .style("fill", locFillFn);
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
    state: { config, expensiveConfig }
  } = props;

  const prevState = usePrevious({ data, config, expensiveConfig });

  console.log("creating Viz");

  useEffect(() => {
    if (
      prevState === undefined ||
      prevState.expensiveConfig !== expensiveConfig
    ) {
      console.log("expensive config change");
      draw(d3Container, data, state);
    } else {
      console.log("cheap config change");
      update(d3Container, data, state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, state]);

  return (
    <aside className="Viz">
      <svg ref={d3Container} />
    </aside>
  );
};

export default Viz;
