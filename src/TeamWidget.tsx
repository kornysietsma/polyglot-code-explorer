import * as d3 from "d3";

import { NO_TEAM_SYMBOL } from "./nodeData";
import { State, Team, themedColours } from "./state";

export const TeamWidget = (props: {
  team: Team;
  bodyText?: string;
  hoverText?: string;
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

const NoTeamWidget = (props: {
  bodyText?: string;
  hoverText?: string;
  noTeamColour: string;
}) => {
  const { bodyText, hoverText, noTeamColour } = props;
  const hsl = d3.hsl(d3.color(noTeamColour)!);
  const textColour = hsl.l > 0.5 ? "black" : "white";
  const fixedBodyText =
    bodyText == undefined
      ? undefined
      : bodyText == NO_TEAM_SYMBOL
      ? "No Team"
      : bodyText;
  const fixedHoverText =
    hoverText == undefined
      ? undefined
      : hoverText == NO_TEAM_SYMBOL
      ? "No Team"
      : hoverText;
  return (
    <span
      className="teamWidget"
      style={{ backgroundColor: noTeamColour, color: textColour }}
      title={fixedHoverText}
    >
      {fixedBodyText || " "}
    </span>
  );
};

export function teamOrNoTeamWidget(
  key: string,
  teamName: string,
  teams: Map<string, Team>,
  state: State,
  bodyText?: string,
  hoverText?: string
) {
  if (teamName == NO_TEAM_SYMBOL) {
    const colour = themedColours(state.config).teams.noTeamColour;
    return (
      <NoTeamWidget
        key={key}
        bodyText={bodyText}
        hoverText={hoverText}
        noTeamColour={colour}
      ></NoTeamWidget>
    );
  } else {
    const team = teams.get(teamName);
    if (!team) {
      throw new Error(`Invalid team name ${teamName}`);
    }
    return (
      <TeamWidget
        key={key}
        team={team}
        bodyText={bodyText}
        hoverText={hoverText}
      ></TeamWidget>
    );
  }
}
