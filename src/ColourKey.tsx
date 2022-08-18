import React from "react";

const ColourKey = ({
  title,
  keyData,
}: {
  title: string;
  keyData: [string, string][];
}) => {
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
              <tr key={value}>
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
