import {
  NO_TEAM_SYMBOL,
  nodeChangersByTeam,
  topTeamsPartitioned,
} from "./nodeData";
import {
  FileNode,
  isFile,
  PolyglotData,
  TreeNode,
} from "./polyglot_data.types";
import {
  ColourKey,
  coloursToColourKey,
  FileChangeMetric,
  PatternId,
  State,
  Teams,
  themedColours,
  UserAliases,
  UserTeams,
} from "./state";

export const SVG_PARTITIONS = 3;

/** finds the top teams, by given metric,
 * finds or creates the svgPatternId,
 * updates svgPatternIds and svgPatternLookup
 * with the ID for the node.
 * If there is no pattern, set nothing -
 * the renderer will show undefined as neutral
 */
function calculateFilePatterns(
  svgPatternIds: Map<ColourKey, PatternId>,
  svgPatternLookup: Map<string, PatternId>,
  node: FileNode,
  aliases: UserAliases,
  teams: Teams,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number,
  metric: FileChangeMetric,
  partitions: number,
  includeNonTeamChanges: boolean,
  noTeamColour: string
) {
  // NOTE - we set 'ignoreNonTeamChanges' to false here, so partition %s include any non-team users.  We remove them later.
  const changers = nodeChangersByTeam(
    node,
    aliases,
    ignoredUsers,
    userTeams,
    earliest,
    latest,
    true
  );
  if (changers == undefined) {
    return;
  }
  const topTeams = topTeamsPartitioned(
    changers,
    metric,
    partitions,
    includeNonTeamChanges
  );
  if (topTeams == undefined || topTeams.length == 0) {
    return;
  }
  function teamColour(team: string): string {
    return team == NO_TEAM_SYMBOL ? noTeamColour : teams.get(team)!.colour;
  }
  const colourKey = coloursToColourKey(topTeams.map(teamColour));
  let patternId = svgPatternIds.get(colourKey);
  if (patternId !== undefined) {
    svgPatternLookup.set(node.path, patternId);
    return;
  }
  patternId = svgPatternIds.size;
  svgPatternIds.set(colourKey, patternId);
  svgPatternLookup.set(node.path, patternId);
}

function calculateNodePatterns(
  svgPatternIds: Map<ColourKey, PatternId>,
  svgPatternLookup: Map<string, PatternId>,
  node: TreeNode,
  aliases: UserAliases,
  teams: Teams,
  ignoredUsers: Set<number>,
  userTeams: UserTeams,
  earliest: number,
  latest: number,
  metric: FileChangeMetric,
  partitions: number,
  includeNonTeamChanges: boolean,
  noTeamColour: string
) {
  if (isFile(node)) {
    calculateFilePatterns(
      svgPatternIds,
      svgPatternLookup,
      node,
      aliases,
      teams,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      metric,
      partitions,
      includeNonTeamChanges,
      noTeamColour
    );
  } else {
    node.children.forEach((child) => {
      calculateNodePatterns(
        svgPatternIds,
        svgPatternLookup,
        child,
        aliases,
        teams,
        ignoredUsers,
        userTeams,
        earliest,
        latest,
        metric,
        partitions,
        includeNonTeamChanges,
        noTeamColour
      );
    });
  }
}

export function calculateSvgPatterns(
  state: State,
  files: PolyglotData
): {
  svgPatternIds: Map<ColourKey, PatternId>;
  svgPatternLookup: Map<string, PatternId>;
} {
  const { config } = state;

  const { aliases, ignoredUsers, teams } = config.teamsAndAliases;
  const { userTeams } = state.calculated;
  const { earliest, latest } = config.filters.dateRange;
  const { showNonTeamChanges } = config.teamVisualisation;
  const noTeamColour = themedColours(config).noTeamColour;

  console.time("calculating svg patterns");
  const svgPatternIds: Map<ColourKey, PatternId> = new Map();
  const svgPatternLookup: Map<string, PatternId> = new Map();
  calculateNodePatterns(
    svgPatternIds,
    svgPatternLookup,
    files.tree,
    aliases,
    teams,
    ignoredUsers,
    userTeams,
    earliest,
    latest,
    config.fileChangeMetric,
    SVG_PARTITIONS,
    showNonTeamChanges,
    noTeamColour
  );
  console.timeEnd("calculating svg patterns");
  return { svgPatternIds, svgPatternLookup };
}
