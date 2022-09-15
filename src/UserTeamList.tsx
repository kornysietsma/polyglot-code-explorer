import { State, Team } from "./state";
import { TeamWidget } from "./TeamWidget";

/** Creating the team list and sorting it is up to the caller - see functions below */
export const UserTeamList = (props: {
  teams: [name: string, data: Team][];
  showNames: boolean;
}) => {
  const { teams, showNames } = props;
  return (
    <span>
      {teams.map(([teamName, team]) => (
        <TeamWidget
          key={teamName}
          team={team}
          bodyText={showNames ? teamName : undefined}
          hoverText={teamName}
        ></TeamWidget>
      ))}
    </span>
  );
};

export function userTeamListForUser(
  state: State,
  userId: number,
  showNames: boolean
) {
  const { userTeams } = state.calculated;
  const { teams } = state.config.teamsAndAliases;

  const teamNames = userTeams.get(userId);
  if (teamNames && teamNames.size > 0) {
    const filteredTeams: [name: string, data: Team][] = [...teamNames]
      .sort()
      .map((teamName) => [teamName, teams.get(teamName)!]);
    return (
      <UserTeamList teams={filteredTeams} showNames={showNames}></UserTeamList>
    );
  } else return <></>;
}
