/* eslint-disable react/prop-types */
import React from "react";
import * as d3 from "d3";
import ColourKey from "./ColourKey";

const GoodBadUglyKey = props => {
  const { title, visualization, config } = props;
  // TODO: dry this up:
  const { good, bad, ugly } = config[visualization];
  const { goodColour, badColour, uglyColour } = config.colours;
  const goodBadUglyScale = d3
    .scaleLinear()
    .domain([good, bad, ugly])
    .range([goodColour, badColour, uglyColour])
    .interpolate(d3.interpolateHcl)
    .clamp(true);

  const goodBad = d3.interpolateNumber(good, bad);
  const badUgly = d3.interpolateNumber(bad, ugly);
  const key = [];
  for (let ix = 0.0; ix < 1.0; ix += 0.1) {
    const metric = goodBad(ix);
    key.push([Math.round(metric), goodBadUglyScale(metric)]);
  }
  for (let ix = 0.1; ix <= 1.0; ix += 0.1) {
    const metric = badUgly(ix);
    key.push([Math.round(metric), goodBadUglyScale(metric)]);
  }
  return <ColourKey title={title} keyData={key} />;
};

export default GoodBadUglyKey;
