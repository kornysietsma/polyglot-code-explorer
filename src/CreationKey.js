/* eslint-disable react/prop-types */
import React from "react";
import * as d3 from "d3";
import { lowHighScale } from "./ColourScales";
import { humanizeDate } from "./datetimes";

const CreationKey = props => {
  const { config, state } = props;
  const {
    dateRange: { earliest, latest }
  } = config;
  const maxAge = (latest - earliest) / (24 * 60 * 60);

  const scale = lowHighScale(config, 0, maxAge);

  const keyText = value =>
    `${Math.floor(value)} (${humanizeDate(latest - value * (24 * 60 * 60))})`;

  const key = [["Outside date range", config.colours.neutralColour]];
  for (let ix = 0; ix <= 20; ix += 1) {
    const age = Math.floor((ix * maxAge) / 20);
    key.push([keyText(age), scale(age)]);
  }
  return (
    <div>
      <p>Creation age in days</p>
      <table>
        <th>
          <td>Age</td>
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

export default CreationKey;
