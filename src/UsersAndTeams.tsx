import React, { useId } from "react";
import ReactModal from "react-modal";

import { DefaultProps } from "./components.types";
import EditAlias from "./EditAlias";
import { themedColours } from "./state/colours";
import { IgnoredUsersTable } from "./teams/IgnoredUsersTable";
import {
  ImportExportControls,
  ImportMessages,
} from "./teams/ImportExportControls";
import {
  initialPageState,
  pageStateToSaveData,
  recalcStatsForPageState,
  UsersAndTeamsPageState,
  usersAndTeamsToPageFormat,
} from "./teams/pageState";
import { TeamsTable } from "./teams/TeamsTable";
import { UsersAndTeamsHelp } from "./teams/UsersAndTeamsHelp";
import { UsersTable } from "./teams/UsersTable";

/**
 * The Users and Teams modal: it owns the page state, seeds it from the global state when opened,
 * and dispatches it back on save. Everything inside it is a section of `src/teams/` - see
 * `teams/pageState.ts` for the state those sections share, and `teams/pageStateEdits.ts` for
 * what they can do to it.
 */
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

  const [recalcStats, setRecalcStats] = React.useState(true);
  const recalcStatsId = useId();

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

  const pageStateProps = { pageState, setPageState, applyEdit };
  const neutralColour = themedColours(state.config).neutralColour;

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
          <ImportExportControls
            {...pageStateProps}
            dataName={dataRef.current.data.name}
            importContext={{ tree, users, earliest, latest, recalcStats }}
          />
          <label htmlFor={recalcStatsId}>
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
          <button
            onClick={() =>
              setPageState(
                recalcStatsForPageState(
                  tree,
                  earliest,
                  latest,
                  pageState,
                  false
                )
              )
            }
          >
            refresh stats now
          </button>
        </div>
        <ImportMessages {...pageStateProps} />
        <h3>Users and Teams</h3>
        <UsersAndTeamsHelp />
        <TeamsTable {...pageStateProps} neutralColour={neutralColour} />
        {/* actually as a modal, this could be anywhere in the page */}
        <EditAlias
          aliasBeingEdited={aliasBeingEdited}
          modalIsOpen={aliasModalIsOpen}
          setIsOpen={setAliasModalIsOpen}
          parentState={pageState}
          setParentState={setPageStateAndMaybeRecalc}
        />
        <IgnoredUsersTable {...pageStateProps} />
        <UsersTable
          {...pageStateProps}
          neutralColour={neutralColour}
          onCreateAlias={() => {
            setAliasBeingEdited(undefined);
            setAliasModalIsOpen(true);
          }}
          onEditAlias={(userId) => {
            setAliasBeingEdited(userId);
            setAliasModalIsOpen(true);
          }}
        />
      </ReactModal>
    </div>
  );
};

export default UsersAndTeams;
