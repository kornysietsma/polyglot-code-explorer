import { useId } from "react";

import { sortTeamsByName } from "../state";
import { UserTeamList } from "../UserTeamList";
import ToggleablePanel from "../widgets/ToggleablePanel";
import { PageStateProps } from "./pageState";
import * as edits from "./pageStateEdits";
import { nextSort, sortHeaderStyle, visibleUsers } from "./userList";

/**
 * Every user and alias, filtered, sorted and selectable - the table the rest of the panel acts
 * on, since teams, aliases and ignoring all work from whatever is selected here.
 */
export const UsersTable = (
  props: PageStateProps & {
    neutralColour: string;
    onCreateAlias: () => void;
    onEditAlias: (userId: number) => void;
  }
) => {
  const {
    pageState,
    setPageState,
    applyEdit,
    neutralColour,
    onCreateAlias,
    onEditAlias,
  } = props;

  const showCheckedUsersId = useId();

  // Which actions are offered depends on what kind of thing is selected: an alias can take more
  // users, but cannot itself be aliased or ignored.
  const checkedAliasUsers = [...pageState.checkedUsers].filter(
    (u) => pageState.usersAndAliases[u]!.isAlias
  );
  const checkedNormalUsers = [...pageState.checkedUsers].filter(
    (u) => !pageState.usersAndAliases[u]!.isAlias
  );

  const setUserFilter = (userFilter: string) =>
    setPageState(edits.setUserFilter(pageState, userFilter));

  const setSort = (key: string) =>
    setPageState(
      edits.setUsersSort(pageState, nextSort(pageState.usersSort, key))
    );

  function userTeamDisplay(userId: number) {
    const teams = edits
      .teamsForUserIncludingHidden(pageState.teams, userId)
      .sort(sortTeamsByName);
    return <UserTeamList teams={teams} showNames={true}></UserTeamList>;
  }

  return (
    <ToggleablePanel
      title="Users"
      showInitially={true}
      borderlessIfHidden={true}
    >
      {pageState.checkedUsers.size > 0 ? (
        <div className="buttonList">
          <button
            onClick={() =>
              applyEdit(edits.createTeam(pageState, neutralColour))
            }
          >
            Create a new team with selected user(s)
          </button>
          {checkedAliasUsers.length == 0 ? (
            <button onClick={onCreateAlias}>Create alias</button>
          ) : null}
          {checkedAliasUsers.length == 1 && checkedNormalUsers.length > 0 ? (
            <button onClick={() => onEditAlias(checkedAliasUsers[0]!)}>
              Add users to alias
            </button>
          ) : null}
          {checkedNormalUsers.length > 0 && checkedAliasUsers.length == 0 ? (
            <button
              onClick={() =>
                // `ignoreCheckedUsers` deep-clones, so the recalculation must not clone again.
                applyEdit(edits.ignoreCheckedUsers(pageState), true)
              }
            >
              Ignore user(s) (will remove from teams!)
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
        <button
          onClick={() => setPageState(edits.selectAllVisibleUsers(pageState))}
        >
          Select all
        </button>
        <button onClick={() => setPageState(edits.selectNoUsers(pageState))}>
          None
        </button>
        <label htmlFor={showCheckedUsersId}>
          only show selected users:
          <input
            type="checkbox"
            id={showCheckedUsersId}
            onChange={() =>
              setPageState(
                edits.setShowCheckedUsers(
                  pageState,
                  !pageState.showCheckedUsers
                )
              )
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
              className={sortHeaderStyle(pageState.usersSort, "id")}
            >
              ID
            </th>
            <th
              onClick={() => setSort("name")}
              className={sortHeaderStyle(pageState.usersSort, "name")}
            >
              Name
            </th>
            <th
              onClick={() => setSort("email")}
              className={sortHeaderStyle(pageState.usersSort, "email")}
            >
              Email
            </th>
            <th
              onClick={() => setSort("files")}
              className={sortHeaderStyle(pageState.usersSort, "files")}
            >
              Files changed
            </th>
            <th
              onClick={() => setSort("commits")}
              className={sortHeaderStyle(pageState.usersSort, "commits")}
            >
              File commits
            </th>
            <th
              onClick={() => setSort("days")}
              className={sortHeaderStyle(pageState.usersSort, "days")}
            >
              Days with a change
            </th>
            <th
              onClick={() => setSort("lines")}
              className={sortHeaderStyle(pageState.usersSort, "lines")}
            >
              Lines changed total
            </th>
            <th>Actions</th>
            <th>Teams</th>
          </tr>
        </thead>
        <tbody>
          {visibleUsers(pageState).map((user) => {
            return (
              <tr key={user.id}>
                <td>
                  <input
                    type="checkbox"
                    value={user.id}
                    onChange={(event) =>
                      setPageState(
                        edits.setUserChecked(
                          pageState,
                          parseInt(event.target.value),
                          event.target.checked
                        )
                      )
                    }
                    checked={pageState.checkedUsers.has(user.id)}
                  ></input>
                </td>
                <td>{user.id}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.files}</td>
                <td>{user.commits}</td>
                <td>{user.days.size}</td>
                <td>{user.lines}</td>
                <td>
                  {user.isAlias ? (
                    <button onClick={() => onEditAlias(user.id)}>
                      Edit Alias
                    </button>
                  ) : null}
                </td>

                <td>{userTeamDisplay(user.id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ToggleablePanel>
  );
};
