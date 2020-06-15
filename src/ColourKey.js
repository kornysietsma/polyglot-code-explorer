/* eslint-disable react/prop-types */
import React from "react";

const ColourKey = props => {
  const { title, keyData } = props;
  return (
    <div>
      <p>{title}</p>
      <table>
        <thead>
          <tr>
            <td>Value</td>
            <td>Colour</td>
          </tr>
        </thead>
        <tbody>
          {keyData.map(([value, colour]) => {
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
        </tbody>
      </table>
    </div>
  );
};

export default ColourKey;
