/* for exporting and importing aliases and teams to JSON
  Tries to avoid saving user IDs so the data can be imported
  to a different project with similar users.
  Not very reliable but sometimes worth it.
*/

export const FORMAT_VERSION = "1.0.0";

export type ExportUser = {
  name?: string;
  email?: string;
};
export type ExportTeam = {
  name: string;
  users: ExportUser[];
  colour: string;
};

export type UserExportData = {
  version: string;
  aliasData: ExportUser[];
  aliases: [user: ExportUser, aliasedTo: ExportUser][];
  teams: ExportTeam[];
  hiddenTeams: string[];
};
