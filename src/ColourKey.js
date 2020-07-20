import React from "react";
import PropTypes from "prop-types";

const ColourKey = props => {
  const { title, keyData } = props;
  return (
    <div>
      <p>{title}</p>
      <table>
        <thead>
          <tr>
            <th>Value</th>
            <th>Colour</th>
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
ColourKey.propTypes = {
  title: PropTypes.string.isRequired,
  keyData: PropTypes.arrayOf(PropTypes.array).isRequired
};
export default ColourKey;
