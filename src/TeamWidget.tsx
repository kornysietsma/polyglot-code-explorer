import * as d3 from "d3";

import { Team } from "./state";

const TeamWidget = (props: {
  team: Team;
  bodyText?: string;
  hoverText: string;
}) => {
  const { team, bodyText, hoverText } = props;
  const hsl = d3.hsl(d3.color(team.colour)!);
  const textColour = hsl.l > 0.5 ? "black" : "white";
  return (
    <span
      className="teamWidget"
      style={{ backgroundColor: team.colour, color: textColour }}
      title={hoverText}
    >
      {bodyText || " "}
    </span>
  );
};

export default TeamWidget;
