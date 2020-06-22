/* eslint-disable react/prop-types */
import React from "react";
import * as d3 from "d3";
import { earlyLateScale } from "./ColourScales";
import { humanizeDate } from "./datetimes";

const CreationKey = props => {
  const { config, state } = props;
  const {
    dateRange: { earliest, latest }
  } = config;
  const dateRange = latest - earliest;

  const scale = earlyLateScale(config, earliest, latest);

  const keyText = value =>
    `${humanizeDate(value)}`;

  const key = [["Outside date range", config.colours.neutralColour]];
  for (let ix = 0; ix <= 20; ix += 1) {
    const age = earliest + Math.floor((ix * dateRange) / 20);
    key.push([keyText(age), scale(age)]);
  }
  return (
    <div>
      <p>Creation date</p>
      <table>
        <th>
          <td>Date</td>
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
