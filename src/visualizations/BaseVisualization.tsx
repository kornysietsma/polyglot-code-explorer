import { HierarchyNode } from "d3";
import { ReactElement } from "react";

import { nodeCreationDate } from "../nodeData";
import {
  DirectoryNode,
  FeatureFlags,
  FileNode,
  isFile,
  isHierarchyDirectory,
  TreeNode,
} from "../polyglot_data.types";
import { Action, Config, State, themedColours } from "../state";
import { Visualization } from "../VisualizationData";
import { VizMetadata } from "../viz.types";

/**
 * the base for most visualizations
 * Based on a ScaleUnit - the unit used for the scale, typically `number` for numeric scales,
 * or`string` for discrete scales like programming language.
 *
 * Note Visualizations are short-lived - typically just for one render function - as
 * whenever the state or metadata changes, the visualization may change.
 */

export abstract class BaseVisualization<ScaleUnit> implements Visualization {
  state: State;
  metadata: VizMetadata;
  features: FeatureFlags;
  dispatch: React.Dispatch<Action> | undefined;
  /**
   * Constructs a Visualization.  Note these should be short-lived as state and metadata change all the time.
   */
  constructor(
    state: State,
    metadata: VizMetadata,
    features: FeatureFlags,
    dispatch: React.Dispatch<Action> | undefined
  ) {
    this.state = state;
    this.metadata = metadata;
    this.features = features;
    this.dispatch = dispatch;
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
   *  any extra controls to insert in the control panel */
  extraControls(): ReactElement | undefined {
    return undefined;
  }

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
    const override = overrideColourFunction(d, config, this.features);
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
  config: Config,
  features: FeatureFlags
): string | undefined {
  const { nonexistentColour, circlePackBackground } = themedColours(config);
  const { latest } = config.filters.dateRange;

  if (node.data.layout.algorithm === "circlePack") return circlePackBackground;
  const creationDate =
    isFile(node.data) && nodeCreationDate(node.data, features);
  if (creationDate && creationDate > latest) return nonexistentColour;
  return undefined;
}
