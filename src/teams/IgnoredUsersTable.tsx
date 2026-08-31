import ToggleablePanel from "../widgets/ToggleablePanel";
import { PageStateProps } from "./pageState";
import * as edits from "./pageStateEdits";

/**
 * The users excluded from every visualisation. Ignoring is done from the user table below; this
 * is where it is undone - though un-ignoring does not put a user back into the teams they were
 * dropped from, since nothing records which those were.
 */
export const IgnoredUsersTable = (props: PageStateProps) => {
  const { pageState, setPageState, applyEdit } = props;

  return (
    <ToggleablePanel
      title="Ignored Users"
      showInitially={true}
      borderlessIfHidden={true}
    >
      {pageState.checkedIgnoredUsers.size > 0 ? (
        <div className="buttonList">
          <button
            onClick={() => applyEdit(edits.unIgnoreCheckedUsers(pageState))}
          >
            unignore user(s)
          </button>
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
                      setPageState(
                        edits.setIgnoredUserChecked(
                          pageState,
                          parseInt(event.target.value),
                          event.target.checked
                        )
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
  );
};
