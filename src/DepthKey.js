/* eslint-disable react/prop-types */
import React from "react";
import * as d3 from "d3";

const DepthKey = props => {
  const { config, stats } = props;
  // TODO: dry this up:
  const scale = d3
    .scaleSequential(d3.interpolatePlasma)
    .domain([0, stats.maxDepth])
    .clamp(true);

  const key = [];
  for (let ix = 1; ix <= stats.maxDepth; ix += 1) {
    key.push([ix, scale(ix)]);
  }
  return (
    <div>
      <p>Nesting Depth</p>
      <table>
        <th>
          <td>Depth</td>
          <td>Colour</td>
        </th>
        {key.map(([value, colour]) => {
          return (
            <tr>
              <td>{value}</td>
              <td
                className="colourSample"
                style={{ backgroundColor: colour, width: "4em" }}
              />
            </tr>
          );
        })}
      </table>
    </div>
  );
};

export default DepthKey;
