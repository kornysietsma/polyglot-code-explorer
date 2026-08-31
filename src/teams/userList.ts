// What the panel's user table shows: which users are visible, and in what order. Pure queries
// over the page state - nothing here changes it, see `pageStateEdits.ts` for that.

import {
  UserAndStatsAndAliases,
  UsersAndTeamsPageState,
  UsersSort,
} from "./pageState";

export function sortUsers(
  users: UserAndStatsAndAliases[],
  usersSort: UsersSort
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
      case "lines":
        return usersSort.ascending ? b[key] - a[key] : a[key] - b[key];
      case "days":
        return usersSort.ascending
          ? b.days.size - a.days.size
          : a.days.size - b.days.size;
      default:
        throw new Error(`Unknown sort key ${key}`);
    }
  });
}

/** Clicking a column sorts by it, and clicking the column already sorted by reverses it. */
export function nextSort(usersSort: UsersSort, key: string): UsersSort {
  return key == usersSort.key
    ? { key, ascending: !usersSort.ascending }
    : { key, ascending: true };
}

export function sortHeaderStyle(
  usersSort: UsersSort,
  key: string
): string | undefined {
  if (key == usersSort.key) {
    return usersSort.ascending
      ? "sortable sortAscending"
      : "sortable sortDescending";
  }
  return "sortable unsorted";
}

export function userIsVisible(
  pageState: UsersAndTeamsPageState,
  user: UserAndStatsAndAliases
): boolean {
  if (pageState.aliases.has(user.id) || pageState.ignoredUsers.has(user.id)) {
    return false; // don't show ignored or aliased users at all
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
  // The filter is lower-cased here as well as the values it is matched against - without that,
  // any capital letter typed into the filter box matched nothing at all.
  const filter = pageState.userFilter.toLowerCase();
  return (
    (user.name ?? "").toLowerCase().includes(filter) ||
    (user.email ?? "").toLowerCase().includes(filter)
  );
}

/** The user table's contents: sorted, then filtered, exactly as it is rendered. */
export function visibleUsers(
  pageState: UsersAndTeamsPageState
): UserAndStatsAndAliases[] {
  return sortUsers(pageState.usersAndAliases, pageState.usersSort).filter(
    (user) => userIsVisible(pageState, user)
  );
}
