import { HierarchyNode } from "d3";
import { ReactElement } from "react";

import { FeatureFlags, TreeNode } from "./polyglot_data.types";
import { Action, Config, State } from "./state";
import { AgeVisualization } from "./visualizations/AgeVisualization";
import { ChurnVisualization } from "./visualizations/ChurnVisualization";
import { CreationDateVisualization } from "./visualizations/CreationDateVisualization";
import { IndentationVisualization } from "./visualizations/IndentationVisualization";
import { LanguageVisualization } from "./visualizations/LanguageVisualization";
import { LinesOfCodeVisualization } from "./visualizations/LinesOfCodeVisualization";
import { NestingDepthVisualization } from "./visualizations/NestingDepthVisualization";
import { NumberOfChangersVisualization } from "./visualizations/NumberOfChangersVisualization";
import { SingleTeamVisualization } from "./visualizations/SingleTeamVisualization";
import { TeamPatternVisualization } from "./visualizations/TeamPatternVisualization";
import { TeamVisualization } from "./visualizations/TeamVisualization";
import { VizMetadata } from "./viz.types";

/**
 * The public view of a Visualization
 * basically just enough to define a fill function, and draw a colour key.
 * Actual visualisation implementations are mostly BaseVisualization implementations
 * which vary depending on the scale units used.
 */
export interface Visualization {
  fillFn: (d: HierarchyNode<TreeNode>) => string;
  colourKey: () => [string, string][];
  extraControls: () => ReactElement | undefined;
}

/**
 * The main Visualisations structure holds a mix of VisualizationData and ParentVisualizationData
 * - this is basically just enough
 */
export type VisualizationData = {
  displayOrder: number;
  title: string;
  featureCheck?: (features: FeatureFlags) => boolean;
  help: ReactElement;
  buildVisualization: (
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) => Visualization;
};

type ParentVisualizationData = {
  displayOrder: number;
  title: string;
  featureCheck?: (features: FeatureFlags) => boolean;
  defaultChild: string;
  children: { [subname: string]: VisualizationData };
};

export function isParentVisualization(
  d: VisualizationData | ParentVisualizationData
): d is ParentVisualizationData {
  return (d as ParentVisualizationData).children !== undefined;
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
    buildVisualization(state, metadata, features, dispatch) {
      return new LanguageVisualization(state, metadata, features, dispatch);
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
    buildVisualization(state, metadata, features, dispatch) {
      return new LinesOfCodeVisualization(state, metadata, features, dispatch);
    },
  },
  depth: {
    displayOrder: 2,
    title: "Nesting depth",
    help: <p>Shows nesting depth in the directory structure</p>,
    buildVisualization(state, metadata, features, dispatch) {
      return new NestingDepthVisualization(state, metadata, features, dispatch);
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
        buildVisualization(state, metadata, features, dispatch) {
          return new IndentationVisualization(
            state,
            metadata,
            features,
            dispatch,
            "sum"
          );
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
        buildVisualization(state, metadata, features, dispatch) {
          return new IndentationVisualization(
            state,
            metadata,
            features,
            dispatch,
            "p99"
          );
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
        buildVisualization(state, metadata, features, dispatch) {
          return new IndentationVisualization(
            state,
            metadata,
            features,
            dispatch,
            "stddev"
          );
        },
      },
    },
  },
  age: {
    displayOrder: 4,
    title: "Age of last change",
    featureCheck: (features: FeatureFlags) =>
      features.git || features.file_stats,
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
    buildVisualization(state, metadata, features, dispatch) {
      return new AgeVisualization(state, metadata, features, dispatch);
    },
  },
  creation: {
    displayOrder: 5,
    title: "Creation date",
    featureCheck: (features: FeatureFlags) =>
      features.git || features.file_stats,
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
    buildVisualization(state, metadata, features, dispatch) {
      return new CreationDateVisualization(state, metadata, features, dispatch);
    },
  },
  numberOfChangers: {
    displayOrder: 6,
    title: "Number of unique changers",
    featureCheck: (features: FeatureFlags) => features.git,
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
    buildVisualization(state, metadata, features, dispatch) {
      return new NumberOfChangersVisualization(
        state,
        metadata,
        features,
        dispatch
      );
    },
  },

  churn: {
    displayOrder: 7,
    title: "Churn",
    featureCheck: (features: FeatureFlags) => features.git,

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
        buildVisualization(state, metadata, features, dispatch) {
          return new ChurnVisualization(
            state,
            metadata,
            features,
            dispatch,
            "days"
          );
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
        buildVisualization(state, metadata, features, dispatch) {
          return new ChurnVisualization(
            state,
            metadata,
            features,
            dispatch,
            "commits"
          );
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
        buildVisualization(state, metadata, features, dispatch) {
          return new ChurnVisualization(
            state,
            metadata,
            features,
            dispatch,
            "lines"
          );
        },
      },
    },
  },
  team: {
    displayOrder: 8,
    title: "Top Team",
    featureCheck: (features: FeatureFlags) => features.git,

    help: (
      <div>
        <p>
          Shows the team who has made the most changes in the selected date
          range
        </p>
      </div>
    ),
    buildVisualization(state, metadata, features, dispatch) {
      return new TeamVisualization(state, metadata, features, dispatch);
    },
  },
  teamPattern: {
    displayOrder: 9,
    title: "Top Teams (patterned)",
    featureCheck: (features: FeatureFlags) => features.git,
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
      </div>
    ),
    buildVisualization(state, metadata, features, dispatch) {
      return new TeamPatternVisualization(state, metadata, features, dispatch);
    },
  },
  singleTeam: {
    displayOrder: 10,
    title: "Single Team Impact",
    featureCheck: (features: FeatureFlags) => features.git,
    help: (
      <div>
        <p>Shows the impact of a single team, relative to all other users</p>
        <p>
          If you select &ldquo;Use lightness to show amount of change?&rdquo;
          then files with greater change are at selected colour, files with less
          change will be darker.
        </p>
        <p>
          You can set a cap to avoid too-dark visualisations - e.g. if the file
          with the greatest number of commits has 1000 commits, setting the cap
          to 10% will show 100 commits (or more) as fully bright.
        </p>
      </div>
    ),
    buildVisualization(state, metadata, features, dispatch) {
      return new SingleTeamVisualization(state, metadata, features, dispatch);
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
