import React, { useId } from "react";
import ReactModal from "react-modal";

import { DefaultProps } from "./components.types";
import EditAlias from "./EditAlias";
import {
  exportableTeamsAndAliasesToJson,
  ExportTeamMember,
  ExportTeamsAndAliases,
  ExportUser,
  FORMAT_FILE_USER_VERSION,
  jsonToStandaloneTeamsAndAliases,
  StandaloneExportTeamsAndAliases,
  teamsAndAliasesFromImport,
} from "./exportImport";
import { displayUser } from "./polyglot_data.types";
import { errorMessage, infoMessage, Message, sortTeamsByName } from "./state";
import { themedColours } from "./state/colours";
import { colourSchemeAt, colourSchemes } from "./teams/colourSchemes";
import {
  initialPageState,
  pageStateToSaveData,
  recalcStatsForPageState,
  UsersAndTeamsPageState,
  usersAndTeamsToPageFormat,
} from "./teams/pageState";
import * as edits from "./teams/pageStateEdits";
import { nextSort, sortHeaderStyle, visibleUsers } from "./teams/userList";
import { UserTeamList } from "./UserTeamList";
import { ColourPicker } from "./widgets/ColourPicker";
import DelayedInput from "./widgets/DelayedInput";
import HelpPanel from "./widgets/HelpPanel";
import ToggleablePanel from "./widgets/ToggleablePanel";

const UsersAndTeams = (props: DefaultProps) => {
  const { dataRef, state, dispatch } = props;

  const { users } = dataRef.current.metadata;
  const { earliest, latest } = state.config.filters.dateRange;

  const [pageState, setPageState] =
    React.useState<UsersAndTeamsPageState>(initialPageState());

  const tree = dataRef.current.data.tree;

  const [modalIsOpen, setIsOpen] = React.useState(false);

  const [aliasModalIsOpen, setAliasModalIsOpen] = React.useState(false);
  const [aliasBeingEdited, setAliasBeingEdited] = React.useState<
    number | undefined
  >(undefined);

  const [tolerant, setTolerant] = React.useState(false);
  const tolerantCheckId = useId();
  const [recalcStats, setRecalcStats] = React.useState(true);
  const recalcStatsId = useId();

  const hiddenFileInput = React.useRef<HTMLInputElement>(null);

  function openModal() {
    // Need to re-initialise local state from parent state every time we open the modal
    const { earliest, latest } = state.config.filters.dateRange;

    const { usersAndAliases, aliases, teams, ignoredUsers, teamStats } =
      usersAndTeamsToPageFormat(
        tree,
        users,
        state.config.teamsAndAliases,
        earliest,
        latest,
        true // on open, we always refresh stats
      );

    setPageState({
      ...initialPageState(),
      usersAndAliases,
      aliases,
      teams,
      ignoredUsers,
      teamStats: teamStats ?? new Map(),
      noTeamColour: themedColours(state.config).teams.noTeamColour,
    });

    setIsOpen(true);
  }

  /**
   * The "refresh stats after editing" checkbox decides whether an edit recomputes statistics.
   * `alreadyCloned` says whether the edit that produced `workingPageState` deep-copied it - see
   * `recalcStatsForPageState`.
   */
  function maybeRecalc(
    workingPageState: UsersAndTeamsPageState,
    alreadyCloned: boolean
  ): UsersAndTeamsPageState {
    return recalcStats
      ? recalcStatsForPageState(
          tree,
          earliest,
          latest,
          workingPageState,
          alreadyCloned
        )
      : workingPageState;
  }
  /** Applies an edit and recalculates if the checkbox says to. */
  function applyEdit(
    newState: UsersAndTeamsPageState,
    alreadyCloned = false
  ): void {
    setPageState(maybeRecalc(newState, alreadyCloned));
  }
  /** What `EditAlias` hands its edits back through - it deep-clones the state it is given. */
  function setPageStateAndMaybeRecalc(newState: UsersAndTeamsPageState): void {
    applyEdit(newState, true);
  }

  function manuallyRecalcStats() {
    setPageState(
      recalcStatsForPageState(tree, earliest, latest, pageState, false)
    );
  }

  function cancel() {
    setIsOpen(false);
  }
  function save() {
    dispatch({
      type: "setUserTeamAliasData",
      payload: pageStateToSaveData(pageState),
    });
    setIsOpen(false);
  }

  function toExportUser(userId: number): ExportUser {
    const user = pageState.usersAndAliases[userId];
    if (user == undefined) {
      throw new Error(`Can't export user ${userId}`);
    }
    return { name: user.name, email: user.email };
  }
  function toExportTeamMember(userId: number): ExportTeamMember {
    const user = pageState.usersAndAliases[userId];
    if (user == undefined) {
      throw new Error(`Can't export user ${userId}`);
    }
    return { name: user.name, email: user.email, isAlias: user.isAlias };
  }

  function exportToJson() {
    const exportData: ExportTeamsAndAliases = {
      aliasData: pageState.usersAndAliases
        .filter((user) => user.isAlias)
        .map((user) => {
          return { name: user.name, email: user.email };
        }),
      aliases: [...pageState.aliases].map(([fromUser, toUser]) => [
        toExportUser(fromUser),
        toExportUser(toUser),
      ]),
      teams: [...pageState.teams].map(([teamName, team]) => {
        const teamMembers = [...team.users].map(toExportTeamMember);
        return {
          name: teamName,
          users: teamMembers,
          colour: team.colour,
          hidden: team.hidden,
        };
      }),
      ignoredUsers: [...pageState.ignoredUsers].map((userId) =>
        toExportUser(userId)
      ),
    };
    const standaloneExportData: StandaloneExportTeamsAndAliases = {
      formatVersion: FORMAT_FILE_USER_VERSION,
      teamsAndAliases: exportData,
    };

    const tempElement = document.createElement("a");
    const file = new Blob(
      [exportableTeamsAndAliasesToJson(standaloneExportData)],
      {
        type: "application/json",
      }
    );
    tempElement.href = URL.createObjectURL(file);
    tempElement.download = `${dataRef.current.data.name}_users.json`;
    document.body.appendChild(tempElement);
    tempElement.click();
    tempElement.parentNode?.removeChild(tempElement);
  }

  function clearImportMessages() {
    setPageState({
      ...pageState,
      importMessages: [],
    });
  }

  function addImportMessage(message: Message) {
    setPageState({
      ...pageState,
      importMessages: [...pageState.importMessages, message],
    });
  }

  function processImportedData(
    data: StandaloneExportTeamsAndAliases,
    tolerant: boolean
  ) {
    const messages: Message[] = [];
    try {
      let failed = false;
      if (
        data.formatVersion == undefined ||
        data.formatVersion != FORMAT_FILE_USER_VERSION
      ) {
        messages.push(
          errorMessage(
            `Invalid format version ${data.formatVersion} - expected ${FORMAT_FILE_USER_VERSION}`
          )
        );
        if (!tolerant) failed = true;
      }
      const {
        aliasData: importedAliasData,
        aliases: importedAliases,
        teams: importedTeams,
        ignoredUsers: importedIgnoredUsers,
      } = data.teamsAndAliases;

      const {
        newTeamsAndAliases,
        failed: newFailed,
        messages: newMessages,
      } = teamsAndAliasesFromImport(
        users,
        importedAliases,
        importedAliasData,
        importedTeams,
        importedIgnoredUsers,
        tolerant
      );
      if (newFailed) {
        failed = true;
      }
      if (newMessages.length > 0) {
        messages.push(...newMessages);
      }
      if (failed || newTeamsAndAliases == undefined) {
        setPageState({
          ...pageState,
          importMessages: messages,
        });
        return;
      }

      const { usersAndAliases, aliases, ignoredUsers, teams } =
        usersAndTeamsToPageFormat(
          tree,
          users,
          newTeamsAndAliases,
          earliest,
          latest,
          recalcStats
        );

      if (tolerant && messages.length > 0) {
        messages.push(infoMessage("Errors were found and ignored."));
      }
      messages.push(infoMessage("User data loaded."));

      setPageState({
        ...initialPageState(),
        usersAndAliases,
        teams,
        aliases,
        ignoredUsers,
        importMessages: messages,
      });
    } catch (e) {
      messages.push(errorMessage(`${e}`));
      // TODO: set page state
      setPageState({
        ...pageState,
        importMessages: messages,
      });

      return;
    }
  }

  function importFromJson(files: FileList | null) {
    if (files == null) {
      addImportMessage(errorMessage("No file passed to import"));
      return;
    }
    const file = files[0]!;
    const fileReader = new FileReader();
    fileReader.readAsText(file);
    fileReader.onload = (e) => {
      try {
        if (e.target && typeof e.target?.result == "string") {
          const value = jsonToStandaloneTeamsAndAliases(e.target.result);
          processImportedData(value, tolerant);
        } else {
          addImportMessage(errorMessage("invalid upload result type"));
        }
      } catch (e) {
        addImportMessage(errorMessage(`${e}`));
      }
    };
  }

  // --- wiring: every edit goes through `applyEdit`, which recalculates stats if asked to ------

  const setSort = (key: string) =>
    setPageState(
      edits.setUsersSort(pageState, nextSort(pageState.usersSort, key))
    );

  function handleUserCheck(user: number, checked: boolean) {
    setPageState(edits.setUserChecked(pageState, user, checked));
  }

  function handleTeamCheck(team: string, checked: boolean) {
    applyEdit(edits.setTeamHidden(pageState, team, checked));
  }

  function handleIgnoredUserCheck(user: number, checked: boolean) {
    setPageState(edits.setIgnoredUserChecked(pageState, user, checked));
  }

  const showCheckedUsersId = useId();

  const setUserFilter = (userFilter: string) =>
    setPageState(edits.setUserFilter(pageState, userFilter));

  const newTeam = () =>
    applyEdit(
      edits.createTeam(pageState, themedColours(state.config).neutralColour)
    );

  function selectColourScheme(scheme: number) {
    setPageState(edits.selectColourScheme(pageState, scheme));
  }

  const colourSelectId = useId();
  const colourSelector = (
    <label htmlFor={colourSelectId}>
      Colour scheme for auto-colour:
      <select
        id={colourSelectId}
        value={pageState.colourScheme}
        onChange={(event) =>
          selectColourScheme(Number.parseInt(event.target.value))
        }
      >
        {colourSchemes.map(([name, scheme], index) => (
          <option key={name} value={index}>
            {name} {`(${scheme.length} colours)`}
          </option>
        ))}
      </select>
    </label>
  );
  const currentScheme = colourSchemeAt(pageState.colourScheme);
  const visibleTeamCount = [...pageState.teams].filter(
    ([, team]) => !team.hidden
  ).length;

  const reColourTeams = () =>
    setPageState(
      edits.recolourTeams(pageState, themedColours(state.config).neutralColour)
    );

  const noTeamId = useId();
  function setNoTeamColour(value: string) {
    setPageState(edits.setNoTeamColour(pageState, value));
  }

  function changeTeamColour(name: string, value: string) {
    setPageState(edits.changeTeamColour(pageState, name, value));
  }

  function validTeamChange(
    oldName: string,
    newName: string
  ): string | undefined {
    return edits.validTeamChange(pageState.teams, oldName, newName);
  }

  function renameTeam(oldName: string, newName: string) {
    applyEdit(edits.renameTeam(pageState, oldName, newName));
  }

  function selectTeamMembers(team: string) {
    setPageState(edits.selectTeamMembers(pageState, team));
  }

  function addUsersToTeam(teamName: string) {
    applyEdit(edits.addUsersToTeam(pageState, teamName));
  }

  function removeUsersFromTeam(teamName: string) {
    applyEdit(edits.removeUsersFromTeam(pageState, teamName));
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

  function ignoreCheckedUsers() {
    // `ignoreCheckedUsers` deep-clones, so the recalculation must not clone again.
    applyEdit(edits.ignoreCheckedUsers(pageState), true);
  }

  function unIgnoreCheckedUsers() {
    applyEdit(edits.unIgnoreCheckedUsers(pageState));
  }

  function userTeamDisplay(userId: number) {
    const teams = edits
      .teamsForUserIncludingHidden(pageState.teams, userId)
      .sort(sortTeamsByName);
    return <UserTeamList teams={teams} showNames={true}></UserTeamList>;
  }

  function selectAllUsers() {
    setPageState(edits.selectAllVisibleUsers(pageState));
  }

  function selectNoUsers() {
    setPageState(edits.selectNoUsers(pageState));
  }

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
          <button onClick={exportToJson}>export to JSON</button>
          <button
            onClick={() => {
              clearImportMessages();
              if (hiddenFileInput.current) {
                hiddenFileInput.current.click();
              }
            }}
          >
            import from JSON
          </button>
          <input
            type="file"
            ref={hiddenFileInput}
            name="file"
            style={{ display: "none" }}
            onClick={() => {
              // without this you can't load the same named file twice as onChange doesn't fire!
              hiddenFileInput.current!.value = "";
            }}
            onChange={(event) => {
              importFromJson(event.target?.files);
            }}
          ></input>
          <label htmlFor={tolerantCheckId}>
            Ignore non-fatal import errors:&nbsp;
            <input
              type="checkbox"
              id={tolerantCheckId}
              checked={tolerant}
              onChange={(evt) => {
                setTolerant(evt.target.checked);
              }}
            />
          </label>
          <label htmlFor={tolerantCheckId}>
            Refresh stats after import or editing:&nbsp;
            <input
              type="checkbox"
              id={recalcStatsId}
              checked={recalcStats}
              onChange={(evt) => {
                setRecalcStats(evt.target.checked);
              }}
            />
          </label>
          <button onClick={manuallyRecalcStats}>refresh stats now</button>
        </div>
        {pageState.importMessages.length == 0 ? null : (
          <div className="Messages">
            <h3>Import messages:</h3>
            <ul>
              {pageState.importMessages.map((message, ix) => (
                <li key={ix} className={message.severity}>
                  {message.message}
                </li>
              ))}
            </ul>
            <button onClick={clearImportMessages}>clear</button>
          </div>
        )}
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
            <label htmlFor={noTeamId}>
              Colour for non-team users:
              <ColourPicker
                colour={pageState.noTeamColour}
                onChange={(newColour: string) => {
                  setNoTeamColour(newColour);
                }}
              />
            </label>
            <button onClick={reColourTeams}>auto-colour teams</button>
            {visibleTeamCount > currentScheme.length
              ? `(only ${currentScheme.length} visible teams will get colours, the rest will be neutral) `
              : ""}
            {colourSelector}
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
                          checked={teamData.hidden}
                        ></input>
                      </td>
                      <td>
                        <ColourPicker
                          colour={teamData.colour}
                          onChange={(newColour: string) => {
                            changeTeamColour(name, newColour);
                          }}
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
        {/* actually as a modal, this could be anywhere in the page */}
        <EditAlias
          aliasBeingEdited={aliasBeingEdited}
          modalIsOpen={aliasModalIsOpen}
          setIsOpen={setAliasModalIsOpen}
          parentState={pageState}
          setParentState={setPageStateAndMaybeRecalc}
        />
        <ToggleablePanel
          title="Ignored Users"
          showInitially={true}
          borderlessIfHidden={true}
        >
          {pageState.checkedIgnoredUsers.size > 0 ? (
            <div className="buttonList">
              <button onClick={unIgnoreCheckedUsers}>unignore user(s)</button>
            </div>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>select</th>
                <th>id</th>
                <th>name</th>
                <th>email</th>
              </tr>
            </thead>
            <tbody>
              {[...pageState.ignoredUsers].sort().map((userId) => {
                const user = pageState.usersAndAliases[userId];
                if (user == undefined) {
                  throw new Error("Logic error - unknown user");
                }
                return (
                  <tr key={userId}>
                    <td>
                      <input
                        type="checkbox"
                        value={userId}
                        onChange={(event) =>
                          handleIgnoredUserCheck(
                            parseInt(event.target.value),
                            event.target.checked
                          )
                        }
                        checked={pageState.checkedIgnoredUsers.has(userId)}
                      ></input>
                    </td>
                    <td>{userId}</td>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ToggleablePanel>
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
              {checkedNormalUsers.length > 0 &&
              checkedAliasUsers.length == 0 ? (
                <button onClick={ignoreCheckedUsers}>
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
            <button onClick={selectAllUsers}>Select all</button>
            <button onClick={selectNoUsers}>None</button>
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
                          handleUserCheck(
                            parseInt(event.target.value),
                            event.target.checked
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
                        <button onClick={editAlias(user.id)}>Edit Alias</button>
                      ) : null}
                    </td>

                    <td>{userTeamDisplay(user.id)}</td>
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
