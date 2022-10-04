import _ from "lodash";
import { Dispatch, SetStateAction, useId, useState } from "react";
import ReactModal from "react-modal";

import { lastCommitDay } from "./nodeData";
import { Teams } from "./state";
import {
  UserAndStatsAndAliases,
  UsersAndTeamsPageState,
} from "./UsersAndTeams";

type Props = {
  aliasBeingEdited: number | undefined;
  modalIsOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  parentState: UsersAndTeamsPageState;
  setParentState: (newState: UsersAndTeamsPageState) => void;
};

type PageState = {
  aliasName: string;
  aliasEmail: string;
  selectedUsers: Set<number>;
  formErrors: string[];
};

const EditAlias = (props: Props) => {
  const {
    aliasBeingEdited,
    modalIsOpen,
    setIsOpen,
    parentState,
    setParentState,
  } = props;

  const [pageState, setPageState] = useState<PageState>({
    aliasName: "",
    aliasEmail: "",
    selectedUsers: new Set(),
    formErrors: [],
  });

  const aliasNameId = useId();
  const aliasEmailId = useId();

  const shownUsers: Set<number> = modalIsOpen
    ? new Set([
        ...parentState.usersAndAliases
          .filter((user) => {
            const aliasedTo = parentState.aliases.get(user.id);
            if (user.isAlias) {
              return false;
            } else if (parentState.checkedUsers.has(user.id)) {
              return true;
            } else if (
              aliasBeingEdited != undefined &&
              aliasedTo != undefined &&
              aliasedTo == aliasBeingEdited
            ) {
              return true;
            } else {
              return false;
            }
          })
          .map((u) => u.id)
          .sort(),
      ])
    : new Set();

  function validate(state: PageState) {
    const formErrors: string[] = [];
    if (state.aliasName.trim() == "" && state.aliasEmail.trim() == "") {
      formErrors.push("Name and Email cannot both be blank");
    }
    state.formErrors = formErrors;
  }

  function usersAliasedTo(userId: number): number[] {
    return [...parentState.aliases]
      .filter(([, toUser]) => toUser == userId)
      .map(([fromUser]) => fromUser);
  }

  function afterOpen() {
    // Need to re-initialise local state from parent state every time we open the modal
    const newPageState = { ...pageState };
    if (aliasBeingEdited !== undefined) {
      newPageState.aliasName =
        parentState.usersAndAliases[aliasBeingEdited]!.name ?? "";
      newPageState.aliasEmail =
        parentState.usersAndAliases[aliasBeingEdited]!.email ?? "";
    } else {
      // new alias
      const latest = parentState.usersAndAliases[latestUser(shownUsers)];
      if (latest != undefined) {
        newPageState.aliasName = latest.name ?? "";
        newPageState.aliasEmail = latest.email ?? "";
      }
    }
    // TODO: this is wrong if we are adding users to an existing alias!!!
    newPageState.selectedUsers =
      aliasBeingEdited != undefined
        ? new Set(usersAliasedTo(aliasBeingEdited))
        : new Set(shownUsers);
    validate(newPageState);

    setPageState(newPageState);
  }

  function cancel() {
    setIsOpen(false);
  }

  function modifyTeamsAddAlias(
    teams: Teams,
    userId: number,
    aliasId: number
  ): Teams {
    return new Map(
      [...teams].map(([teamName, team]) => {
        if (team.users.has(userId)) {
          team.users.delete(userId);
          team.users.add(aliasId);
        }
        return [teamName, team];
      })
    );
  }

  function modifyTeamsRemoveAlias(
    teams: Teams,
    aliasId: number,
    userId: number
  ): Teams {
    return new Map(
      [...teams].map(([teamName, team]) => {
        if (team.users.has(aliasId)) {
          team.users.add(userId);
          // Don't remove the alias from the team! It might refer to other users
        }
        return [teamName, team];
      })
    );
  }

  function addAlias(
    parentState: UsersAndTeamsPageState,
    aliasId: number,
    userId: number
  ) {
    parentState.aliases.set(userId, aliasId);
    parentState.checkedUsers.delete(userId);
    parentState.teams = modifyTeamsAddAlias(parentState.teams, userId, aliasId);
  }

  function removeAlias(
    parentState: UsersAndTeamsPageState,
    oldAliasId: number,
    userId: number
  ) {
    const oldAlias = parentState.aliases.get(userId);
    if (oldAlias !== undefined) {
      if (oldAlias != oldAliasId) {
        throw new Error("logic error: removing alias but wasn't the right one");
      }
      parentState.aliases.delete(userId);
      parentState.teams = modifyTeamsRemoveAlias(
        parentState.teams,
        oldAlias,
        userId
      );
    }
  }

  function save() {
    const newParentState = _.cloneDeep(parentState);
    if (aliasBeingEdited !== undefined) {
      // update
      const aliasUser = newParentState.usersAndAliases[aliasBeingEdited];
      if (aliasUser == undefined) {
        throw new Error("Logic error: Editing undefined user");
      }
      aliasUser.name = pageState.aliasName;
      aliasUser.email = pageState.aliasEmail;
      newParentState.usersAndAliases.forEach((user, userId) => {
        if (shownUsers.has(userId)) {
          if (!user.isAlias) {
            if (pageState.selectedUsers.has(userId)) {
              addAlias(newParentState, aliasBeingEdited, userId);
            } else {
              removeAlias(newParentState, aliasBeingEdited, userId);
            }
          }
        }
      });
    } else {
      // create
      const aliasUserId = parentState.usersAndAliases.length;
      const aliasUser: UserAndStatsAndAliases = {
        id: aliasUserId,
        name: pageState.aliasName,
        email: pageState.aliasEmail,
        isAlias: true,
        commits: 0,
        lines: 0,
        days: new Set(),
        files: 0,
      };
      newParentState.usersAndAliases.push(aliasUser);
      newParentState.usersAndAliases.forEach((user, userId) => {
        if (shownUsers.has(userId)) {
          if (!user.isAlias) {
            if (pageState.selectedUsers.has(userId)) {
              addAlias(newParentState, aliasUserId, userId);
            } else {
              removeAlias(newParentState, aliasUserId, userId);
            }
          }
        }
      });
    }
    setParentState(newParentState);
    setIsOpen(false);
  }

  function latestUser(users: Set<number>): number {
    if (users.size == 0) {
      throw new Error("Logic error: no users supplied");
    }

    const sortedUsers = [...users].sort((a, b) => {
      const lastDayA = lastCommitDay(parentState.usersAndAliases[a]!);
      const lastDayB = lastCommitDay(parentState.usersAndAliases[b]!);
      return (lastDayB ?? 0) - (lastDayA ?? 0);
    });
    return sortedUsers[0]!;
  }
  function setAliasName(value: string) {
    const newPageState = { ...pageState, aliasName: value };
    validate(newPageState);
    setPageState(newPageState);
  }
  function setAliasEmail(value: string) {
    const newPageState = { ...pageState, aliasEmail: value };
    validate(newPageState);
    setPageState(newPageState);
  }

  function handleUserCheck(event: React.ChangeEvent<HTMLInputElement>) {
    const user = parseInt(event.target.value);
    const checked = event.target.checked;
    const selectedUsers = pageState.selectedUsers;

    if (checked) {
      selectedUsers.add(user);
    } else {
      selectedUsers.delete(user);
    }
    setPageState({ ...pageState, selectedUsers });
  }

  return (
    <ReactModal
      isOpen={modalIsOpen}
      onAfterOpen={afterOpen}
      onRequestClose={cancel}
      contentLabel="Users and Teams"
      className={"ModalContent"}
      overlayClassName={"ModalOverlay"}
    >
      <div className="buttonList">
        {pageState.formErrors.length == 0 ? (
          <button onClick={save}>save and close</button>
        ) : (
          <button disabled={true}>(cannot save - fix validation errors)</button>
        )}

        <button onClick={cancel}>cancel</button>
        {pageState.selectedUsers.size == 0 ? (
          <p>Note - there is currently no way to delete an alias</p>
        ) : null}
      </div>
      <div>
        <label htmlFor={aliasNameId}>
          Alias Name:
          <input
            type="text"
            id={aliasNameId}
            value={pageState.aliasName}
            onChange={(evt) => setAliasName(evt.target.value)}
          />
        </label>
        <label htmlFor={aliasNameId}>
          Email:
          <input
            type="text"
            id={aliasEmailId}
            value={pageState.aliasEmail}
            onChange={(evt) => setAliasEmail(evt.target.value)}
          />
        </label>
        {pageState.formErrors.length > 0 ? (
          <div>
            <h4>Errors:</h4>
            <ul>
              {pageState.formErrors.map((e, index) => {
                return <li key={index}>{e}</li>;
              })}
            </ul>
          </div>
        ) : null}
      </div>
      <table className="sortable">
        <thead>
          <tr>
            <th>select</th>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Files changed</th>
            <th>File commits</th>
            <th>Days with a change</th>
            <th>Lines changed total</th>
          </tr>
        </thead>
        <tbody>
          {[...shownUsers].sort().map((userId) => {
            const user = parentState.usersAndAliases[userId]!;

            return (
              <tr key={user.id}>
                <td>
                  <input
                    type="checkbox"
                    value={user.id}
                    onChange={handleUserCheck}
                    checked={pageState.selectedUsers.has(user.id)}
                  ></input>
                </td>
                <td>{user.id}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.files}</td>
                <td>{user.commits}</td>
                <td>{user.days.size}</td>
                <td>{user.lines}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ReactModal>
  );
};

export default EditAlias;
