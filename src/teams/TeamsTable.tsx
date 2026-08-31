import { useId } from "react";

import { displayUser } from "../polyglot_data.types";
import { sortTeamsByName } from "../state";
import { ColourPicker } from "../widgets/ColourPicker";
import DelayedInput from "../widgets/DelayedInput";
import ToggleablePanel from "../widgets/ToggleablePanel";
import { colourSchemeAt, colourSchemes } from "./colourSchemes";
import { PageStateProps } from "./pageState";
import * as edits from "./pageStateEdits";

/**
 * The teams: name, visibility, colour, membership and statistics, one row each. The buttons that
 * add and remove members appear only when users are selected in the user table below.
 */
export const TeamsTable = (
  props: PageStateProps & { neutralColour: string }
) => {
  const { pageState, setPageState, applyEdit, neutralColour } = props;

  const noTeamId = useId();
  const colourSelectId = useId();

  const currentScheme = colourSchemeAt(pageState.colourScheme);
  const visibleTeamCount = [...pageState.teams].filter(
    ([, team]) => !team.hidden
  ).length;

  return (
    <ToggleablePanel
      title="Teams"
      showInitially={true}
      borderlessIfHidden={true}
    >
      <div className="buttonList">
        <label htmlFor={noTeamId}>
          Colour for non-team users:
          <ColourPicker
            colour={pageState.noTeamColour}
            onChange={(newColour: string) => {
              setPageState(edits.setNoTeamColour(pageState, newColour));
            }}
          />
        </label>
        <button
          onClick={() =>
            setPageState(edits.recolourTeams(pageState, neutralColour))
          }
        >
          auto-colour teams
        </button>
        {visibleTeamCount > currentScheme.length
          ? `(only ${currentScheme.length} visible teams will get colours, the rest will be neutral) `
          : ""}
        <label htmlFor={colourSelectId}>
          Colour scheme for auto-colour:
          <select
            id={colourSelectId}
            value={pageState.colourScheme}
            onChange={(event) =>
              setPageState(
                edits.selectColourScheme(
                  pageState,
                  Number.parseInt(event.target.value)
                )
              )
            }
          >
            {colourSchemes.map(([name, scheme], index) => (
              <option key={name} value={index}>
                {name} {`(${scheme.length} colours)`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Hidden</th>
            <th>Colour</th>
            <th>Actions</th>
            <th>Users</th>
            <th>Files</th>
            <th>Commits</th>
            <th>Days</th>
            <th>Lines</th>
          </tr>
        </thead>
        <tbody>
          {[...pageState.teams]
            .sort(sortTeamsByName)
            .map(([name, teamData]) => {
              const stats = pageState.teamStats.get(name);
              return (
                <tr key={name}>
                  <td>
                    {" "}
                    <DelayedInput
                      value={name}
                      onChange={(oldName, newName) =>
                        applyEdit(edits.renameTeam(pageState, oldName, newName))
                      }
                      validate={(oldName, newName) =>
                        edits.validTeamChange(pageState.teams, oldName, newName)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      value={name}
                      onChange={(event) =>
                        applyEdit(
                          edits.setTeamHidden(
                            pageState,
                            event.target.value,
                            event.target.checked
                          )
                        )
                      }
                      checked={teamData.hidden}
                    ></input>
                  </td>
                  <td>
                    <ColourPicker
                      colour={teamData.colour}
                      onChange={(newColour: string) => {
                        setPageState(
                          edits.changeTeamColour(pageState, name, newColour)
                        );
                      }}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setPageState(edits.selectTeamMembers(pageState, name));
                      }}
                    >
                      select
                    </button>
                    {pageState.checkedUsers.size > 0 ? (
                      <button
                        onClick={() => {
                          applyEdit(edits.addUsersToTeam(pageState, name));
                        }}
                      >
                        add users
                      </button>
                    ) : null}
                    {pageState.checkedUsers.size > 0 ? (
                      <button
                        onClick={() => {
                          applyEdit(edits.removeUsersFromTeam(pageState, name));
                        }}
                      >
                        remove users
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {[...teamData.users]
                      .map((u) => {
                        const user = pageState.usersAndAliases[u];
                        if (!user) {
                          throw new Error("invalid user!");
                        }
                        return displayUser(user);
                      })
                      .join(", ")}
                  </td>
                  <td>{stats ? stats.files : 0}</td>
                  <td>{stats ? stats.commits : 0}</td>
                  <td>{stats ? stats.days.size : 0}</td>
                  <td>{stats ? stats.lines : 0}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </ToggleablePanel>
  );
};
