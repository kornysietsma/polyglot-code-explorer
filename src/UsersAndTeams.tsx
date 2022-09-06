import React, { useId } from "react";
import ReactModal from "react-modal";

import { DefaultProps } from "./components.types";
import EditAlias from "./EditAlias";
import { aggregateUserStats, UserStats } from "./nodeData";
import { displayUser, UserData } from "./polyglot_data.types";
import { Team, Teams, themedColours, UserAliases } from "./state";
import ToggleablePanel from "./ToggleablePanel";

export type UserAndStats = UserData & UserStats & { outOfDate: boolean };

export type UsersAndTeamsPageState = {
  users: UserAndStats[];
  teams: Teams;
  aliases: UserAliases;
  usersSort: { key: string; ascending: boolean };
  checkedUsers: Set<number>;
  userFilter: string;
  showCheckedUsers: boolean;
};
const initialPageState: UsersAndTeamsPageState = {
  users: [],
  teams: new Map(),
  aliases: new Map(),
  usersSort: { key: "files", ascending: true },
  checkedUsers: new Set(),
  userFilter: "",
  showCheckedUsers: false,
};

function sortUsers(
  users: UserAndStats[],
  usersSort: { key: string; ascending: boolean }
): UserAndStats[] {
  const { key } = usersSort;
  return [...users].sort((a, b) => {
    switch (key) {
      case "name": {
        const aName = a.name ?? "";
        const bNAme = b.name ?? "";
        return usersSort.ascending
          ? aName.localeCompare(bNAme, "en", {
              ignorePunctuation: true,
              sensitivity: "accent",
            })
          : bNAme.localeCompare(aName, "en", {
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
  const { dataRef, state } = props;

  const { users } = dataRef.current.metadata;

  const { userData } = state.config;

  const [pageState, setPageState] =
    React.useState<UsersAndTeamsPageState>(initialPageState);

  const tree = dataRef.current.files.tree;

  const [modalIsOpen, setIsOpen] = React.useState(false);

  const [aliasModalIsOpen, setAliasModalIsOpen] = React.useState(false);
  const [aliasBeingEdited, setAliasBeingEdited] = React.useState<
    number | undefined
  >(undefined);

  function openModal() {
    // Need to re-initialise local state from parent state every time we open the modal
    const userStats = aggregateUserStats(tree, state);

    const usersWithStats: UserAndStats[] = users.map((user) => {
      const stats = userStats.get(user.id);
      if (stats) {
        return { ...user, ...stats, outOfDate: false };
      } else {
        return {
          ...user,
          files: 0,
          lines: 0,
          days: 0,
          commits: 0,
          lastCommitDay: undefined,
          outOfDate: false,
        };
      }
    });

    setPageState({
      ...initialPageState,
      users: usersWithStats,
      teams: userData.teams,
      aliases: userData.aliases,
    });

    setIsOpen(true);
  }

  function cancel() {
    setIsOpen(false);
  }
  function save() {
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

  function handleUserCheck(event: React.ChangeEvent<HTMLInputElement>) {
    const user = parseInt(event.target.value);
    const checked = event.target.checked;
    const checkedUsers = pageState.checkedUsers;

    if (checked) {
      checkedUsers.add(user);
    } else {
      checkedUsers.delete(user);
    }
    setPageState({ ...pageState, checkedUsers });
  }

  const showCheckedUsersId = useId();

  const userFilter: (user: UserAndStats) => boolean = (user) => {
    if (pageState.aliases.has(user.id)) {
      return false; // don't show aliased users at all
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
        ? pageState.users[pageState.checkedUsers.values().next().value]?.name
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
    const sortedTeams = [...pageState.teams].sort(teamSort);

    if (sortedTeams.length == 0) {
      console.log("Can't recolour teams as none are shown");
      return;
    }
    // note any colours outside the big colour range will be white!  Remap those yourself...
    const { neutralColour } = themedColours(state.config);

    sortedTeams.forEach(([, team], index) => {
      if (index < bigColourRange.length) {
        team.colour = bigColourRange[index]!;
      } else {
        team.colour = neutralColour;
      }
    });
    setPageState({ ...pageState, teams: new Map(sortedTeams) });
  };

  function changeTeamColour(name: string, value: string) {
    const teams = pageState.teams;
    const team = teams.get(name);
    if (team) team.colour = value;
    setPageState({ ...pageState, teams });
  }

  const checkedAliasUsers = modalIsOpen
    ? [...pageState.checkedUsers].filter((u) => pageState.users[u]!.isAlias)
    : [];
  const checkedNormalUsers = modalIsOpen
    ? [...pageState.checkedUsers].filter((u) => !pageState.users[u]!.isAlias)
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
          <p>Users and Teams</p>
        </div>
        <h3>Users and Teams</h3>
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
                <th>Colour</th>
                <th>Users</th>
              </tr>
            </thead>
            <tbody>
              {[...pageState.teams].sort(teamSort).map(([name, teamData]) => {
                return (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      {" "}
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
                      {[...teamData.users]
                        .map((u) => {
                          const user = pageState.users[u];
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
              only checked:
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
              {sortUsers(pageState.users, pageState.usersSort)
                .filter(userFilter)
                .map((user) => {
                  const aliased = pageState.aliases.has(user.id);

                  return (
                    <tr key={user.id} className={aliased ? "aliased" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          value={user.id}
                          onChange={handleUserCheck}
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
