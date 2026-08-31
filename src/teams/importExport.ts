// Converting the panel's page state to and from the standalone teams-and-aliases JSON file, so
// teams survive independently of the data file they were built against. The file format itself
// lives in `src/exportImport.ts`, which this and the saved-state file both go through; what is
// here is the page state's half of the conversion.
//
// The DOM parts - starting a download, reading an uploaded file - stay in
// `ImportExportControls.tsx`, so everything below is pure and testable.

import {
  ExportTeamMember,
  ExportTeamsAndAliases,
  ExportUser,
  FORMAT_FILE_USER_VERSION,
  StandaloneExportTeamsAndAliases,
  teamsAndAliasesFromImport,
} from "../exportImport";
import { TreeNode, UserData } from "../polyglot_data.types";
import { errorMessage, infoMessage, Message } from "../state";
import {
  initialPageState,
  UsersAndTeamsPageState,
  usersAndTeamsToPageFormat,
} from "./pageState";

/** What an import needs in order to rebuild the page state around the teams it read. */
export type ImportContext = {
  tree: TreeNode;
  users: UserData[];
  earliest: number;
  latest: number;
  recalcStats: boolean;
};

export function pageStateToExportData(
  pageState: UsersAndTeamsPageState
): StandaloneExportTeamsAndAliases {
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
  return {
    formatVersion: FORMAT_FILE_USER_VERSION,
    teamsAndAliases: exportData,
  };
}

/**
 * The page state after an import: on success, a fresh state holding the imported teams; on
 * failure, the state as it was with the errors added. Either way the messages are on the state
 * that comes back, since telling the user what happened is the point.
 *
 * `tolerant` downgrades non-fatal problems - a wrong format version, a user the data file does
 * not have - to warnings, which is the "ignore non-fatal import errors" checkbox.
 */
export function pageStateFromImport(
  current: UsersAndTeamsPageState,
  data: StandaloneExportTeamsAndAliases,
  tolerant: boolean,
  context: ImportContext
): UsersAndTeamsPageState {
  const { tree, users, earliest, latest, recalcStats } = context;
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
      return { ...current, importMessages: messages };
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

    return {
      ...initialPageState(),
      usersAndAliases,
      teams,
      aliases,
      ignoredUsers,
      importMessages: messages,
    };
  } catch (e) {
    messages.push(errorMessage(`${e}`));
    return { ...current, importMessages: messages };
  }
}
