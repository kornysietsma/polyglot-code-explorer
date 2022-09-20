import { HierarchyNode, interpolatePlasma, scaleSequential } from "d3";
import { ReactElement } from "react";

import {
  creationKeyData,
  depthKey,
  goodBadUglyColourKeyData,
  numberOfChangersKeyData,
} from "./colourKeys";
import {
  earlyLateScaleBuilder,
  goodBadUglyScale,
  numberOfChangersScale,
  teamScale,
} from "./ColourScales";
import {
  nodeAge,
  nodeChurnCommits,
  nodeChurnDays,
  nodeChurnLines,
  nodeCreationDate,
  nodeCreationDateClipped,
  nodeCumulativeLinesOfCode,
  nodeDepth,
  nodeIndentation,
  nodeLanguage,
  nodeNumberOfChangers,
  nodeTopTeam,
} from "./nodeData";
import {
  DirectoryNode,
  FileNode,
  isFile,
  isHierarchyDirectory,
  TreeNode,
} from "./polyglot_data.types";
import {
  Config,
  PatternId,
  sortTeamsByName,
  State,
  themedColours,
} from "./state";
import { VizMetadata } from "./viz.types";

/**
 * The public view of a Visualization
 * basically just enough to define a fill function, and draw a colour key.
 * Actual visualisation implementations are mostly BaseVisualization implementations
 * which vary depending on the scale units used.
 */
interface Visualization {
  fillFn: (d: HierarchyNode<TreeNode>) => string;
  colourKey: () => [string, string][];
}

/**
 * the base for most visualizations
 * Based on a ScaleUnit - the unit used for the scale, typically `number` for numeric scales,
 * or`string` for discrete scales like programming language.
 *
 * Note Visualizations are short-lived - typically just for one render function - as
 * whenever the state or metadata changes, the visualization may change.
 */
abstract class BaseVisualization<ScaleUnit> implements Visualization {
  state: State;
  metadata: VizMetadata;
  /**
   * Constructs a Visualization.  Note these should be short-lived as state and metadata change all the time.
   */
  constructor(state: State, metadata: VizMetadata) {
    this.state = state;
    this.metadata = metadata;
  }

  /**
   * Returns the 'value' of a particular file in the hierarchy, or undefined if for some reason the file has no relevant value
   * @param d the node being drawn
   */
  abstract dataFn(d: HierarchyNode<FileNode>): ScaleUnit | undefined;
  /**
   * Returns the 'value' of a directory in the hierarchy - a parent in the tree structure.
   *
   * In many cases this returns undefined as it is not always easy to summarise e.g. complexity for a whole directory.
   * Also directories are currently only shown if you deliberately trim the display depth (this may change)
   * @param d the parent node being drawn
   */
  abstract parentFn(d: HierarchyNode<DirectoryNode>): ScaleUnit | undefined;
  /** Converts a value in the scale of the visualization into a colour string.
   *
   * TODO: should bring in a type for colour strings to make this clearer!
   *
   * Note this is a function property, not an object method, as we often assign it in the constructor based on state
   */
  abstract scale: (d: ScaleUnit) => string | undefined;

  /**
   * The colour key as passed to the ColourKey component to show the key
   */
  abstract colourKey(): [string, string][];

  /**
   * For a given node (directory or file), returns the colour used to fill that node.
   * Note that undefined nodes are converted to a neutral colour,
   * and some nodes have their colour overridden - the background of the root node when circle packing is always black,
   * and if the date selection ends before a file is created, it is also shown in black.
   * @returns a colour string, scaled using `scale()`
   */
  fillFn(d: HierarchyNode<TreeNode>): string {
    const { config } = this.state;
    const { neutralColour } = themedColours(config);
    const override = overrideColourFunction(d, config);
    if (override !== undefined) return override;
    const value = isHierarchyDirectory(d)
      ? this.parentFn(d)
      : this.dataFn(d as HierarchyNode<FileNode>);

    return value === undefined
      ? neutralColour
      : this.scale(value) ?? neutralColour;
  }
}

// overrides most other colours - mostly top-level circle packed background, and files that don't exist yet
// returns a colour, or undefined if there is no override
function overrideColourFunction(
  node: HierarchyNode<TreeNode>,
  config: Config
): string | undefined {
  const { nonexistentColour, circlePackBackground } = themedColours(config);
  const { latest } = config.filters.dateRange;

  if (node.data.layout.algorithm === "circlePack") return circlePackBackground;
  const creationDate = isFile(node.data) && nodeCreationDate(node.data);
  if (creationDate && creationDate > latest) return nonexistentColour;
  return undefined;
}

/**
 * The main Visualisations structure holds a mix of VisualizationData and ParentVisualizationData
 * - this is basically just enough
 */
export type VisualizationData = {
  displayOrder: number;
  title: string;
  help: ReactElement;
  buildVisualization: (state: State, metadata: VizMetadata) => Visualization;
};

type ParentVisualizationData = {
  displayOrder: number;
  title: string;
  defaultChild: string;
  children: { [subname: string]: VisualizationData };
};

export function isParentVisualization(
  d: VisualizationData | ParentVisualizationData
): d is ParentVisualizationData {
  return (d as ParentVisualizationData).children !== undefined;
}

class LanguageVisualization extends BaseVisualization<string> {
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
  }
  dataFn(d: HierarchyNode<FileNode>): string {
    return nodeLanguage(d.data);
  }
  parentFn(): string | undefined {
    return undefined;
  }

  scale = (v: string) => this.metadata.languages.languageMap.get(v)?.colour;

  colourKey(): [string, string][] {
    const { languageKey, otherColour } = this.metadata.languages;
    return [
      ...languageKey.map((k) => [k.language, k.colour] as [string, string]),
      ["Other languages", otherColour],
    ];
  }
}

class LinesOfCodeVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    this.scale = goodBadUglyScale(state.config, state.config.loc);
  }
  dataFn(d: HierarchyNode<FileNode>): number {
    return nodeCumulativeLinesOfCode(d.data);
  }
  parentFn(): number | undefined {
    return undefined;
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.loc
    );
  }
}

class NestingDepthVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    const { maxDepth } = this.metadata.stats;
    this.scale = scaleSequential(interpolatePlasma)
      .domain([0, maxDepth])
      .clamp(true);
  }
  dataFn(d: HierarchyNode<FileNode>): number {
    return nodeDepth(d);
  }
  parentFn(d: HierarchyNode<DirectoryNode>): number | undefined {
    return nodeDepth(d);
  }

  colourKey(): [string, string][] {
    return depthKey(this.scale, this.state, this.metadata);
  }
}

type IndentationMetric = "sum" | "p99" | "stddev";

class IndentationVisualization extends BaseVisualization<number> {
  metric: IndentationMetric;
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata, metric: IndentationMetric) {
    super(state, metadata);
    this.metric = metric;
    this.scale = goodBadUglyScale(
      state.config,
      state.config.indentation[metric]
    );
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    return nodeIndentation(d.data, this.metric);
  }
  parentFn(): number | undefined {
    return undefined;
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.indentation[this.metric]
    );
  }
}

class AgeVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    this.scale = goodBadUglyScale(state.config, state.config.age);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { ignoredUsers } = this.state.config.teamsAndAliases;

    return nodeAge(d.data, ignoredUsers, earliest, latest);
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.age
    );
  }
}

class CreationDateVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    this.scale = earlyLateScaleBuilder(state);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    if (earliest && latest) {
      return nodeCreationDateClipped(d.data, earliest, latest);
    }
    return undefined;
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return creationKeyData(this.scale, this.state);
  }
}

class NumberOfChangersVisualization extends BaseVisualization<number> {
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    this.scale = numberOfChangersScale(state);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { aliases, ignoredUsers } = this.state.config.teamsAndAliases;
    return nodeNumberOfChangers(
      d.data,
      aliases,
      ignoredUsers,
      earliest,
      latest
    );
  }
  parentFn(): number | undefined {
    return undefined;
  }
  colourKey(): [string, string][] {
    return numberOfChangersKeyData(this.scale, this.state);
  }
}

type ChurnMetric = "days" | "commits" | "lines";

class ChurnVisualization extends BaseVisualization<number> {
  metric: ChurnMetric;
  scale: (v: number) => string | undefined;
  constructor(state: State, metadata: VizMetadata, metric: ChurnMetric) {
    super(state, metadata);
    this.metric = metric;
    this.scale = goodBadUglyScale(state.config, state.config.churn[metric]);
  }
  dataFn(d: HierarchyNode<FileNode>): number | undefined {
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { ignoredUsers } = this.state.config.teamsAndAliases;

    switch (this.metric) {
      case "days":
        return nodeChurnDays(d.data, ignoredUsers, earliest, latest);
      case "commits":
        return nodeChurnCommits(d.data, ignoredUsers, earliest, latest);
      case "lines":
        return nodeChurnLines(d.data, ignoredUsers, earliest, latest);
    }
  }
  parentFn(): number | undefined {
    return undefined;
  }

  colourKey(): [string, string][] {
    return goodBadUglyColourKeyData(
      this.scale,
      this.state,
      this.state.config.churn[this.metric]
    );
  }
}

class TeamVisualization extends BaseVisualization<string> {
  scale: (v: string) => string | undefined;
  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
    this.scale = teamScale(state);
  }
  dataFn(d: HierarchyNode<FileNode>): string | undefined {
    const { aliases, ignoredUsers } = this.state.config.teamsAndAliases;
    const { userTeams } = this.state.calculated;
    const { earliest, latest } = this.state.config.filters.dateRange;
    const { showNonTeamChanges } = this.state.config.teamVisualisation;
    return nodeTopTeam(
      d.data,
      this.state.config.fileChangeMetric,
      aliases,
      ignoredUsers,
      userTeams,
      earliest,
      latest,
      showNonTeamChanges
    );
  }
  parentFn(): string | undefined {
    // TODO: implement this!
    return undefined;
  }

  colourKey(): [string, string][] {
    const { teams } = this.state.config.teamsAndAliases;
    const teamColours: [string, string][] = [...teams]
      .filter(([, team]) => !team.hidden)
      .sort(sortTeamsByName)
      .map(([name, team]) => [name, team.colour]);
    if (this.state.config.teamVisualisation.showNonTeamChanges) {
      return [
        ["Users with no team", themedColours(this.state.config).noTeamColour],
        ...teamColours,
      ];
    } else {
      return teamColours;
    }
  }
}

class TeamPatternVisualization extends BaseVisualization<PatternId> {
  scale: (v: PatternId) => string | undefined = (v) => `url(#pattern${v})`;

  constructor(state: State, metadata: VizMetadata) {
    super(state, metadata);
  }
  dataFn(d: HierarchyNode<FileNode>): PatternId | undefined {
    const { svgPatternLookup } = this.state.calculated.svgPatterns;
    return svgPatternLookup.get(d.data.path);
  }
  parentFn(): PatternId | undefined {
    // TODO: implement this!
    return undefined;
  }

  colourKey(): [string, string][] {
    const { teams } = this.state.config.teamsAndAliases;
    const teamColours: [string, string][] = [...teams]
      .filter(([, team]) => !team.hidden)
      .sort(sortTeamsByName)
      .map(([name, team]) => [name, team.colour]);
    if (this.state.config.teamVisualisation.showNonTeamChanges) {
      return [
        ["Users with no team", themedColours(this.state.config).noTeamColour],
        ...teamColours,
      ];
    } else {
      return teamColours;
    }
  }
}

export const Visualizations: {
  [visName: string]: VisualizationData | ParentVisualizationData;
} = {
  language: {
    displayOrder: 0,
    title: "Programming Language",
    help: <p>Shows the most common programming languages</p>,
    // dataFn: unHierarchyAdapter(nodeLanguage),
    // parentFn: blankParent,
    buildVisualization(state, metadata) {
      return new LanguageVisualization(state, metadata);
    },
  },
  loc: {
    displayOrder: 1,
    title: "Lines of Code",
    help: (
      <div>
        <p>
          Large lines of code has been shown to be strongly correlated with
          complexity. Good code &ldquo;fits in your head&rdquo;.
        </p>
        <p>
          Note that the map has areas roughly proportional to lines of code, but
          the voronoi power map isn&apos;t perfect and areas may be distorted
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new LinesOfCodeVisualization(state, metadata);
    },
  },
  depth: {
    displayOrder: 2,
    title: "Nesting depth",
    help: <p>Shows nesting depth in the directory structure</p>,
    buildVisualization(state, metadata) {
      return new NestingDepthVisualization(state, metadata);
    },
  },
  indentation: {
    displayOrder: 3,
    title: "Indentation",
    defaultChild: "stddev",
    children: {
      sum: {
        title: "Total area",
        displayOrder: 0,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the total area - the sum of the
              indentation of all lines. It will highlight large files, which are
              often the source of issues.
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new IndentationVisualization(state, metadata, "sum");
        },
      },
      p99: {
        title: "Worst indentation",
        displayOrder: 1,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the worst indentation (the 99th
              percentile) of each file. It is better for spotting specific
              problems than overall complexity.
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new IndentationVisualization(state, metadata, "p99");
        },
      },
      stddev: {
        title: "Standard deviation",
        displayOrder: 2,
        help: (
          <div>
            <p>
              Code indentation can be correlated with complexity - though
              inconsistent formatting can mess this up. Tabs are assumed to be 4
              spaces.
            </p>
            <p>
              This visualisation shows the standard deviation of indentations -
              it is a good indicator for complexity hot-spots.
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new IndentationVisualization(state, metadata, "stddev");
        },
      },
    },
  },
  age: {
    displayOrder: 4,
    title: "Age of last change",
    help: (
      <div>
        <p>Highlights code which has had no changes for some time.</p>
        <p>
          This may indicate code which has not been touched or refactored in a
          long time, indicating lost knowledge
        </p>
        <p>It may also indicate code that is stable and bug-free</p>
        <p>
          The real meaning may depend on development culture, and quality of
          testing
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new AgeVisualization(state, metadata);
    },
  },
  creation: {
    displayOrder: 5,
    title: "Creation date",
    help: (
      <div>
        <p>
          Creation date - only shows files created in the selected date range
        </p>
        <p>
          This isn&apos;t really related to quality, but is useful for
          visualizing code history
        </p>
        <p>
          Note that this is not a true historical view - the layout doesn&apos;t
          change with changing time scales, and deleted files aren&apos;t shown
          even if you select past dates.
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new CreationDateVisualization(state, metadata);
    },
  },
  numberOfChangers: {
    displayOrder: 6,
    title: "Number of unique changers",
    help: (
      <div>
        <p>
          Shows unique changers in selected date range. Too few changers might
          indicate lack of shared understanding of code. Too many changers might
          indicate poorly designed code that has too many concerns and needs
          constant change.
        </p>
        <p>
          Note currently there is no way to distinguish one user with multiple
          logins from multiple people!
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new NumberOfChangersVisualization(state, metadata);
    },
  },

  churn: {
    displayOrder: 7,
    title: "Churn",
    defaultChild: "days",
    children: {
      days: {
        title: "Days containing a change",
        displayOrder: 0,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the proportion of days containing a
              change, so a value of &ldquo;1&rdquo; means the code changed every
              day.
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new ChurnVisualization(state, metadata, "days");
        },
      },
      commits: {
        title: "Commits per day",
        displayOrder: 1,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the number of commits per day, so a value
              of &ldquo;0.1&rdquo; means the code was committed on average once
              every ten days.
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new ChurnVisualization(state, metadata, "commits");
        },
      },
      lines: {
        title: "Lines per day",
        displayOrder: 2,
        help: (
          <div>
            <p>
              Code Churn shows how often the code has changed in the selected
              date range
            </p>
            <p>
              This visualisation shows the number of lines changed per day, a
              sum of additions and deletions, so a value of &ldquo;10&rdquo;
              means ten lines of code were changed per day on average.
            </p>
            <p>
              Note this is a pretty rough measure - if someone added 10 lines
              then someone else deleted those 10 lines it will show up as a 20
              line difference
            </p>
          </div>
        ),
        buildVisualization(state, metadata) {
          return new ChurnVisualization(state, metadata, "lines");
        },
      },
    },
  },
  team: {
    displayOrder: 8,
    title: "Top Team",
    help: (
      <div>
        <p>
          Shows the team who has made the most changes in the selected date
          range
        </p>
        <p>
          The metric used is chosen in &ldquo;Advanced Settings&rdquo; above.
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new TeamVisualization(state, metadata);
    },
  },
  teamPattern: {
    displayOrder: 9,
    title: "Top Teams (patterned)",
    help: (
      <div>
        <p>
          Shows the teams who have made the most changes in the selected date
          range, as a striped pattern
        </p>
        <p>
          If one team has made 2/3 of changes, and another 1/3, they will get 2
          and 1 stripes in the pattern
        </p>
        <p>
          The metric used is chosen in &ldquo;Advanced Settings&rdquo; above.
        </p>
      </div>
    ),
    buildVisualization(state, metadata) {
      return new TeamPatternVisualization(state, metadata);
    },
  },
};

export function getCurrentVis(config: Config) {
  const vis = Visualizations[config.visualization];
  if (!vis) {
    throw new Error("invalid visualization");
  }

  let selected: VisualizationData | ParentVisualizationData | undefined = vis;
  if (isParentVisualization(vis)) {
    if (config.subVis) {
      selected = vis.children[config.subVis];
    } else {
      // can this happen?
      console.warn("No config.subVis selected - using default");
      selected = vis.children[vis.defaultChild];
    }
  }
  if (selected == undefined || isParentVisualization(selected)) {
    throw new Error("Logic error - selected vis is undefined or a parent!");
  } else {
    return selected;
  }
}
