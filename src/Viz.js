/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

const refreshSelection = (svg, data, state) => {
  const { config, expensiveConfig } = state;

  console.log("refreshing");

  const locFillFn = buildLocFillFn();
  const depthFillFn = buildDepthFn();

  const fillFn =
    expensiveConfig.expensiveThing % 2 === 0 ? locFillFn : depthFillFn;
  const strokeFn = d => {
    return d.depth < config.cheapThing ? config.cheapThing - d.depth : 1;
  };

  svg
    .selectAll(".cell")
    .attr("d", d => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("fill", fillFn)
    .style("stroke-width", strokeFn);
};

// use getIn for objects as well as immutable objects
function nestedGet(object, path) {
  // re-enable this if using immutable.js
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
  return d.data.value;
}
function depthDataFn(d) {
  return d.depth;
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

function buildDepthFn() {
  const parentFillColour = d3.rgb("#202020");
  const neutralColour = d3.rgb("green");
  const maxDepth = 10;
  const colourScale = c => d3.interpolateRdYlGn(1.0 - c); // see https://github.com/d3/d3-scale-chromatic/blob/master/README.md
  // const goodestColour = colourScale(0);
  // const baddestColour = colourScale(1);
  const goodBadScale = d3.scaleSequential(colourScale).clamp(true);

  return buildScaledNodeColourFn(
    depthDataFn,
    parentFillColour,
    neutralColour,
    goodBadScale.copy().domain([0, maxDepth])
  );
}

const update = (d3Container, data, state) => {
  if (!d3Container.current) {
    throw Error("No current container");
  }
  const vizEl = d3Container.current;
  const svg = d3.select(vizEl);
  refreshSelection(svg, data, state);
};

const draw = (d3Container, data, state) => {
  const { config, expensiveConfig } = state;

  if (!d3Container.current) {
    console.log("in draw but d3container not yet current");
    return;
  }
  const vizEl = d3Container.current;
  // console.log(vizEl);
  const w = vizEl.clientWidth;
  const h = vizEl.clientHeight;
  const svg = d3.select(vizEl);
  console.log("svg w,h:", w, h);
  const rootNode = d3.hierarchy(data.current).sum(d => d.value);
  console.log("hierarchy built");

  console.log("drawing");

  const allNodes = rootNode.descendants();

  const locFillFn = buildLocFillFn();
  const depthFillFn = buildDepthFn();

  const fillFn =
    expensiveConfig.expensiveThing % 2 === 0 ? locFillFn : depthFillFn;
  const strokeFn = d => {
    return d.depth < config.cheapThing ? config.cheapThing - d.depth : 1;
  };

  const nodes = svg
    .datum(rootNode)
    .selectAll(".cell")
    .data(allNodes, node => node.path);

  const newNodes = nodes
    .enter()
    .append("path")
    .classed("cell", true);

  nodes
    .merge(newNodes)
    .attr("d", d => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("fill", fillFn)
    .style("stroke-width", strokeFn);

  nodes.exit().remove();
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
      console.log("expensive config change - rebuild all");
      draw(d3Container, data, state);
    } else {
      console.log("cheap config change - just redraw");
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
