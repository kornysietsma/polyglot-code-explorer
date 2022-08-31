import React from "react";
import ReactModal from "react-modal";

import { DefaultProps } from "./components.types";
import { aggregateUserStats, UserStats } from "./nodeData";
import { UserData } from "./polyglot_data.types";

type UserAndStats = UserData & UserStats;

type PageState = {
  users: UserAndStats[];
  usersSort: { key: string; ascending: boolean };
  checkedUsers: Set<number>;
};

function sortUsers(
  users: UserAndStats[],
  usersSort: { key: string; ascending: boolean }
): UserAndStats[] {
  const { key } = usersSort;
  return users.sort((a, b) => {
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

  const users = dataRef.current.metadata.users;

  const [pageState, setPageState] = React.useState<PageState>({
    users: [],
    usersSort: { key: "files", ascending: true },
    checkedUsers: new Set(),
  });

  const tree = dataRef.current.files.tree;

  const [modalIsOpen, setIsOpen] = React.useState(false);

  function openModal() {
    // Need to re-initialise local state from parent state every time we open the modal
    const userStats = aggregateUserStats(tree, state);

    const usersSort = { key: "files", ascending: true };

    const usersWithStats: UserAndStats[] = sortUsers(
      users.map((user) => {
        const stats = userStats.get(user.id);
        if (stats) {
          return { ...user, ...stats };
        } else {
          return { ...user, files: 0, lines: 0, days: 0, commits: 0 };
        }
      }),
      usersSort
    );

    setPageState({
      users: usersWithStats,
      usersSort: { key: "files", ascending: true },
      checkedUsers: new Set(),
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
    const users = sortUsers(pageState.users, usersSort);
    setPageState({ ...pageState, usersSort, users });
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
        <div>
          <button onClick={save}>save and close</button>
          <button onClick={cancel}>cancel</button>
        </div>
        <h3>Users and Teams</h3>
        <h4>Users</h4>
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
            </tr>
          </thead>
          <tbody>
            {pageState.users.map((user) => {
              return (
                <tr key={user.id}>
                  <td>
                    <input
                      type="checkbox"
                      value={user.id}
                      onChange={handleUserCheck}
                      checked={pageState.checkedUsers.has(user.id)}
                    ></input>
                  </td>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.files}</td>
                  <td>{user.commits}</td>
                  <td>{user.days}</td>
                  <td>{user.lines}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ReactModal>
    </div>
  );
};

export default UsersAndTeams;
