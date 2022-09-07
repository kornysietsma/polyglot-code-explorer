import _ from "lodash";
import React, { useId } from "react";
import ReactModal from "react-modal";

import { DefaultProps } from "./components.types";
import DelayedInput from "./DelayedInput";
import EditAlias from "./EditAlias";
import HelpPanel from "./HelpPanel";
import { aggregateUserStats, UserStats } from "./nodeData";
import { displayUser, UserData } from "./polyglot_data.types";
import {
  Team,
  Teams,
  themedColours,
  UserAliasData,
  UserAliases,
} from "./state";
import ToggleablePanel from "./ToggleablePanel";

export type UserAndStatsAndAliases = UserData &
  UserStats & { isAlias: boolean; outOfDate: boolean };

export type UsersAndTeamsPageState = {
  usersAndAliases: UserAndStatsAndAliases[];
  aliases: UserAliases;
  teams: Teams;
  hiddenTeams: Set<string>;
  usersSort: { key: string; ascending: boolean };
  checkedUsers: Set<number>;
  userFilter: string;
  showCheckedUsers: boolean;
};
const initialPageState: () => UsersAndTeamsPageState = () => {
  return {
    usersAndAliases: [],
    teams: new Map(),
    hiddenTeams: new Set(),
    aliases: new Map(),
    usersSort: { key: "files", ascending: true },
    checkedUsers: new Set(),
    userFilter: "",
    showCheckedUsers: false,
  };
};

function sortUsers(
  users: UserAndStatsAndAliases[],
  usersSort: { key: string; ascending: boolean }
): UserAndStatsAndAliases[] {
  const { key } = usersSort;
  return [...users].sort((a, b) => {
    switch (key) {
      case "name": {
        const aName = a.name ?? "";
        const bName = b.name ?? "";
        return usersSort.ascending
          ? aName.localeCompare(bName, "en", {
              ignorePunctuation: true,
              sensitivity: "accent",
            })
          : bName.localeCompare(aName, "en", {
              ignorePunctuation: true,
              sensitivity: "accent",
            });
      }
      case "email": {
        const aEmail = a.email ?? "";
        const bEmail = b.email ?? "";
        return usersSort.ascending
          ? aEmail.localeCompare(bEmail, "en", {
              ignorePunctuation: true,
              sensitivity: "accent",
            })
          : bEmail.localeCompare(aEmail, "en", {
              ignorePunctuation: true,
              sensitivity: "accent",
            });
      }
      case "id":
      case "files":
      case "commits":
      case "days":
      case "lines":
        return usersSort.ascending ? b[key] - a[key] : a[key] - b[key];
      default:
        throw new Error(`Unknown sort key ${key}`);
    }
  });
}

const UsersAndTeams = (props: DefaultProps) => {
  const { dataRef, state, dispatch } = props;

  const { users } = dataRef.current.metadata;

  const { userData, filters } = state.config;

  const [pageState, setPageState] = React.useState<UsersAndTeamsPageState>(
    initialPageState()
  );

  const tree = dataRef.current.files.tree;

  const [modalIsOpen, setIsOpen] = React.useState(false);

  const [aliasModalIsOpen, setAliasModalIsOpen] = React.useState(false);
  const [aliasBeingEdited, setAliasBeingEdited] = React.useState<
    number | undefined
  >(undefined);

  function openModal() {
    // Need to re-initialise local state from parent state every time we open the modal
    const userStats = aggregateUserStats(tree, state);

    const usersWithStats: UserAndStatsAndAliases[] = users.map((user) => {
      const stats = userStats.get(user.id);
      if (stats) {
        return { ...user, ...stats, outOfDate: false, isAlias: false };
      } else {
        return {
          ...user,
          files: 0,
          lines: 0,
          days: 0,
          commits: 0,
          lastCommitDay: undefined,
          outOfDate: false,
          isAlias: false,
        };
      }
    });
    const aliasUserData: UserAndStatsAndAliases[] = [...userData.aliasData]
      .sort(([aliasIdA], [aliasIdB]) => aliasIdA - aliasIdB)
      .map(([aliasId, userData]) => {
        const stats = userStats.get(aliasId);
        if (stats) {
          return { ...userData, ...stats, outOfDate: false, isAlias: true };
        } else {
          return {
            ...userData,
            files: 0,
            lines: 0,
            days: 0,
            commits: 0,
            lastCommitDay: undefined,
            outOfDate: false,
            isAlias: true,
          };
        }
      });
    setPageState({
      ...initialPageState(),
      usersAndAliases: [...usersWithStats, ...aliasUserData],
      aliases: userData.aliases,
      teams: userData.teams,
      hiddenTeams: filters.hiddenTeams,
    });

    setIsOpen(true);
  }

  function cancel() {
    setIsOpen(false);
  }
  function save() {
    const aliasData: UserAliasData = new Map();
    for (const user of pageState.usersAndAliases) {
      if (user.isAlias) {
        aliasData.set(user.id, {
          id: user.id,
          name: user.name,
          email: user.email,
        });
      }
    }

    dispatch({
      type: "setUserTeamAliasData",
      payload: {
        teams: pageState.teams,
        hiddenTeams: pageState.hiddenTeams,
        aliases: pageState.aliases,
        aliasData,
      },
    });
    setIsOpen(false);
  }

  const setSort = (key: string) => {
    const usersSort =
      key == pageState.usersSort.key
        ? { key, ascending: !pageState.usersSort.ascending }
        : { key, ascending: true };

    setPageState({ ...pageState, usersSort });
  };

  const sortHeaderStyle = (key: string): string | undefined => {
    if (key == pageState.usersSort.key) {
      return pageState.usersSort.ascending
        ? "sortable sortAscending"
        : "sortable sortDescending";
    }
    return "sortable unsorted";
  };

  function handleUserCheck(user: number, checked: boolean) {
    const checkedUsers = pageState.checkedUsers;

    if (checked) {
      checkedUsers.add(user);
    } else {
      checkedUsers.delete(user);
    }
    setPageState({ ...pageState, checkedUsers });
  }

  function handleTeamCheck(team: string, checked: boolean) {
    const hiddenTeams = pageState.hiddenTeams;

    if (checked) {
      hiddenTeams.add(team);
    } else {
      hiddenTeams.delete(team);
    }
    setPageState({ ...pageState, hiddenTeams });
  }

  const showCheckedUsersId = useId();

  const userFilter: (user: UserAndStatsAndAliases) => boolean = (user) => {
    if (pageState.aliases.has(user.id)) {
      return false; // don't show aliased users at all
    }
    if (pageState.checkedUsers.has(user.id)) {
      return true; // always show checked users - too confusing otherwise!
    }
    if (pageState.showCheckedUsers && !pageState.checkedUsers.has(user.id)) {
      return false;
    }
    if (pageState.userFilter == "") {
      return true;
    }
    return (
      (user.name ?? "").toLowerCase().includes(pageState.userFilter) ||
      (user.email ?? "").toLowerCase().includes(pageState.userFilter)
    );
  };

  const setUserFilter = (userFilter: string) =>
    setPageState({
      ...pageState,
      userFilter,
    });

  const newTeam = () => {
    let teamName =
      pageState.checkedUsers.size == 1
        ? pageState.usersAndAliases[
            pageState.checkedUsers.values().next().value
          ]?.name
        : undefined;
    if (!teamName) {
      teamName = `team ${pageState.teams.size + 1}`;
    }
    // unlikely but if people have been fiddling with names could collide
    if (pageState.teams.has(teamName)) {
      let suffix = pageState.teams.size + 2;
      while (pageState.teams.has(teamName)) {
        teamName = `${teamName}${suffix}`;
        suffix += 1;
      }
    }
    const newTeams = pageState.teams;
    newTeams.set(teamName, {
      users: pageState.checkedUsers,
      colour: themedColours(state.config).neutralColour,
    });
    setPageState({ ...pageState, teams: newTeams, checkedUsers: new Set() });
  };

  const teamSort = (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [aName, a]: [string, Team],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [bName, b]: [string, Team]
  ): number => {
    return aName.localeCompare(bName, "en", {
      ignorePunctuation: true,
      sensitivity: "accent",
    });
  };

  // Generated with http://vrl.cs.brown.edu/color
  const bigColourRange = [
    "#a1def0",
    "#335862",
    "#8dfa9d",
    "#2d7a2c",
    "#e6faa2",
    "#a93713",
    "#47faf4",
    "#7a2f9b",
    "#f7c5f1",
    "#5e497a",
    "#b97bbd",
    "#ec4dd8",
    "#11a0aa",
    "#7191ce",
    "#b9f617",
    "#ec102f",
    "#a0b460",
    "#a20655",
    "#efaa79",
    "#76480d",
  ];

  const reColourTeams = () => {
    let visibleTeams = [...pageState.teams].filter(
      ([name]) => !pageState.hiddenTeams.has(name)
    );
    if (visibleTeams.length == 0) {
      console.log("Can't recolour teams as none are shown");
      return;
    }
    const hiddenTeams = [...pageState.teams].filter(([name]) =>
      pageState.hiddenTeams.has(name)
    );
    visibleTeams = _.shuffle(visibleTeams);

    // note any colours outside the big colour range will be white!  Remap those yourself...
    const { neutralColour } = themedColours(state.config);

    visibleTeams.forEach(([, team], index) => {
      if (index < bigColourRange.length) {
        team.colour = bigColourRange[index]!;
      } else {
        team.colour = neutralColour;
      }
    });
    setPageState({
      ...pageState,
      teams: new Map([...visibleTeams, ...hiddenTeams]),
    });
  };

  function changeTeamColour(name: string, value: string) {
    const teams = _.cloneDeep(pageState.teams);
    const team = teams.get(name);
    if (team) team.colour = value;
    setPageState({ ...pageState, teams });
  }

  function validTeamChange(
    oldName: string,
    newName: string
  ): string | undefined {
    if (oldName == newName) return undefined;
    if (newName.trim() == "") return "cannot be blank";
    if (pageState.teams.has(newName)) return "name already in use";
    return undefined;
  }

  function renameTeam(oldName: string, newName: string) {
    if (validTeamChange(oldName, newName) !== undefined) {
      throw new Error("logic error - invalid team name change");
    }
    const oldTeam = pageState.teams.get(oldName);
    if (oldTeam == undefined) {
      throw new Error("Logic error - invalid old team");
    }
    const { teams, hiddenTeams } = pageState;
    teams.set(newName, oldTeam);
    teams.delete(oldName);
    if (hiddenTeams.has(oldName)) {
      hiddenTeams.delete(oldName);
      hiddenTeams.add(newName);
    }
    setPageState({ ...pageState, teams, hiddenTeams });
  }

  function selectTeamMembers(team: string) {
    const users = pageState.teams.get(team)?.users;
    if (users == undefined) {
      throw new Error("logic error - invalid team name");
    }
    setPageState({ ...pageState, checkedUsers: new Set(users) });
  }

  function addUsersToTeam(teamName: string) {
    const teams = _.cloneDeep(pageState.teams);
    const team = teams.get(teamName);
    if (team == undefined) {
      throw new Error("logic error - invalid team name");
    }
    for (const user of pageState.checkedUsers) {
      team.users.add(user);
    }
    setPageState({ ...pageState, teams });
  }

  function removeUsersFromTeam(teamName: string) {
    const teams = _.cloneDeep(pageState.teams);
    const team = teams.get(teamName);
    if (team == undefined) {
      throw new Error("logic error - invalid team name");
    }
    for (const user of pageState.checkedUsers) {
      team.users.delete(user);
    }
    setPageState({ ...pageState, teams });
  }

  const checkedAliasUsers = modalIsOpen
    ? [...pageState.checkedUsers].filter(
        (u) => pageState.usersAndAliases[u]!.isAlias
      )
    : [];
  const checkedNormalUsers = modalIsOpen
    ? [...pageState.checkedUsers].filter(
        (u) => !pageState.usersAndAliases[u]!.isAlias
      )
    : [];

  const editAlias = (userid: number) => () => {
    setAliasBeingEdited(userid);
    setAliasModalIsOpen(true);
  };

  const createAlias = () => {
    setAliasBeingEdited(undefined);
    setAliasModalIsOpen(true);
  };

  return (
    <div>
      <button onClick={openModal} type="button">
        Users and Teams
      </button>
      <ReactModal
        isOpen={modalIsOpen}
        onRequestClose={cancel}
        contentLabel="Users and Teams"
        className={"ModalContent"}
        overlayClassName={"ModalOverlay"}
      >
        <div className="buttonList">
          <button onClick={save}>save and close</button>
          <button onClick={cancel}>cancel</button>
        </div>
        <h3>Users and Teams</h3>
        <HelpPanel>
          <strong>
            Note - changes won&apos;t be saved until you choose &ldquo;Save and
            close&rdquo; at the top!
          </strong>
          <h4>Users</h4>
          <p>
            Select users on the lower panel to show actions for aliasing and
            creating teams.
          </p>
          <p>
            You can click on the column headings to sort the table. You can also
            filter the user list by name and email with the filter field, and
            you can choose to only show selected users with the checkbox.
          </p>
          <h4>Aliases</h4>
          <p>
            Aliases allow you to merge duplicate users e.g. with multiple email
            addresses. An alias is just like a user, with a name and optional
            email address.
          </p>
          <p>You can:</p>
          <ul>
            <li>
              Create an alias by selecting one or more users and pressing the
              create button
            </li>
            <li>
              Add users to an alias by selecting an alias and one or more users
            </li>
            <li>Edit an alias (edit button on the right)</li>
          </ul>
          <p>(there is currently no way to delete an alias)</p>
          <h4>Teams</h4>
          <p>
            Teams allow you to group users, give them colours, and use the teams
            in other parts of the system
          </p>
          <p>You can:</p>
          <ul>
            <li>
              Create a team by selecting users in the user list, then pressing
              the create new team button.
            </li>
            <li>
              Add or remove users from a team by selecting users then pressing
              the appropriate button
            </li>
            <li>
              Change the colour shown for a team by clicking the colour button
            </li>
            <li>
              Hide a team by checking the &ldquo;hidden&rdquo; button - this
              acts as a filter in the rest of the system, that team will no
              longer be visible
            </li>
            <li>
              Rename a team by typing in the team name field - you need to click
              the ✓ to apply the change. If the change is invalid the ✓ will be
              greyed out - hover over the button for the reason.
            </li>
            <li>
              Auto-colour teams - the auto-colour button assigns a set of up to
              20 colours that should be reasonably distinct to teams in a random
              order. Only shown teams are coloured this way!
            </li>
          </ul>
          <p></p>
        </HelpPanel>
        <ToggleablePanel
          title="Teams"
          showInitially={true}
          borderlessIfHidden={true}
        >
          <div className="buttonList">
            <button onClick={reColourTeams}>auto-colour teams</button>
            {pageState.teams.size >= bigColourRange.length
              ? `(only the first ${bigColourRange.length} teams will get colours, the rest will be neutral)`
              : ""}
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Hidden</th>
                <th>Colour</th>
                <th>Actions</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {[...pageState.teams].sort(teamSort).map(([name, teamData]) => {
                return (
                  <tr key={name}>
                    <td>
                      {" "}
                      <DelayedInput
                        value={name}
                        onChange={renameTeam}
                        validate={validTeamChange}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        value={name}
                        onChange={(event) =>
                          handleTeamCheck(
                            event.target.value,
                            event.target.checked
                          )
                        }
                        checked={pageState.hiddenTeams.has(name)}
                      ></input>
                    </td>
                    <td>
                      <input
                        type="color"
                        name="dot colour"
                        value={teamData.colour}
                        onChange={(evt) =>
                          changeTeamColour(name, evt.target.value)
                        }
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          selectTeamMembers(name);
                        }}
                      >
                        select
                      </button>
                      {pageState.checkedUsers.size > 0 ? (
                        <button
                          onClick={() => {
                            addUsersToTeam(name);
                          }}
                        >
                          add users
                        </button>
                      ) : null}
                      {pageState.checkedUsers.size > 0 ? (
                        <button
                          onClick={() => {
                            removeUsersFromTeam(name);
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ToggleablePanel>
        {/* actually as a modal, this could be anywhere in the page */}
        <EditAlias
          aliasBeingEdited={aliasBeingEdited}
          modalIsOpen={aliasModalIsOpen}
          setIsOpen={setAliasModalIsOpen}
          parentState={pageState}
          setParentState={setPageState}
        />
        <ToggleablePanel
          title="Users"
          showInitially={true}
          borderlessIfHidden={true}
        >
          {pageState.checkedUsers.size > 0 ? (
            <div className="buttonList">
              <button onClick={newTeam}>
                Create a new team with selected user(s)
              </button>
              {checkedAliasUsers.length == 0 ? (
                <button onClick={createAlias}>Create alias</button>
              ) : null}
              {checkedAliasUsers.length == 1 &&
              checkedNormalUsers.length > 0 ? (
                <button onClick={editAlias(checkedAliasUsers[0]!)}>
                  Add users to alias
                </button>
              ) : null}
            </div>
          ) : (
            <p>Select users to show actions</p>
          )}
          <div>
            <strong>Filter: </strong>
            <input
              type="text"
              value={pageState.userFilter}
              onChange={(evt) => setUserFilter(evt.target.value)}
            />
            <button onClick={() => setUserFilter("")}>&#x1f5d1;</button>
            <label htmlFor={showCheckedUsersId}>
              only show selected users:
              <input
                type="checkbox"
                id={showCheckedUsersId}
                onChange={() =>
                  setPageState({
                    ...pageState,
                    showCheckedUsers: !pageState.showCheckedUsers,
                  })
                }
                checked={pageState.showCheckedUsers}
              ></input>
            </label>
          </div>
          <table className="sortable">
            <thead>
              <tr>
                <th>select</th>
                <th
                  onClick={() => setSort("id")}
                  className={sortHeaderStyle("id")}
                >
                  ID
                </th>
                <th>alias?</th>
                <th
                  onClick={() => setSort("name")}
                  className={sortHeaderStyle("name")}
                >
                  Name
                </th>
                <th
                  onClick={() => setSort("email")}
                  className={sortHeaderStyle("email")}
                >
                  Email
                </th>
                <th
                  onClick={() => setSort("files")}
                  className={sortHeaderStyle("files")}
                >
                  Files changed
                </th>
                <th
                  onClick={() => setSort("commits")}
                  className={sortHeaderStyle("commits")}
                >
                  File commits
                </th>
                <th
                  onClick={() => setSort("days")}
                  className={sortHeaderStyle("days")}
                >
                  Days with a change
                </th>
                <th
                  onClick={() => setSort("lines")}
                  className={sortHeaderStyle("lines")}
                >
                  Lines changed total
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortUsers(pageState.usersAndAliases, pageState.usersSort)
                .filter(userFilter)
                .map((user) => {
                  const aliased = pageState.aliases.has(user.id);

                  return (
                    <tr key={user.id} className={aliased ? "aliased" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          value={user.id}
                          onChange={(event) =>
                            handleUserCheck(
                              parseInt(event.target.value),
                              event.target.checked
                            )
                          }
                          checked={pageState.checkedUsers.has(user.id)}
                        ></input>
                      </td>
                      <td>{user.id}</td>
                      <td>
                        {aliased
                          ? ` -> ${pageState.aliases.get(user.id)!}`
                          : ""}
                      </td>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.files}</td>
                      <td>{user.commits}</td>
                      <td>{user.days}</td>
                      <td>{user.lines}</td>
                      <td>
                        {user.isAlias ? (
                          <button onClick={editAlias(user.id)}>
                            Edit Alias
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </ToggleablePanel>
      </ReactModal>
    </div>
  );
};

export default UsersAndTeams;
