// Translates `State` into the inputs GlRenderer's three update paths take, and decides which of
// them a given config change needs (CLAUDE.md, "The three update paths").
//
// This lives outside `src/webgl/` on purpose: those modules stay decoupled from the State type,
// so the coupling is concentrated here. It is also all pure, which `Viz.tsx` - imperative D3 and
// DOM throughout - is not, so the routing decision can be unit-tested directly.

import { HierarchyNode } from "d3";
import _ from "lodash";

import { FeatureFlags, TreeNode } from "./polyglot_data.types";
import { Config, State, themedColours } from "./state";
import { getCurrentVis } from "./VisualizationData";
import { VizMetadata } from "./viz.types";
import { buildPatternPalette, PatternPalette } from "./webgl/colours";
import { NestingStyle } from "./webgl/GlRenderer";

// The per-node fill-colour function the renderer uploads as its colour buffer: just the current
// visualisation's own fillFn. `TeamPatternVisualization`'s `url(#patternN)` fills pass straight
// through to geometry.ts, which routes them through the palette-texture stripe shader rather than
// parseCssColour.
export function buildFillFn(
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State
): (d: HierarchyNode<TreeNode>) => string {
  const visualization = getCurrentVis(state.config).buildVisualization(
    state,
    metadata,
    features,
    undefined
  );
  return (d) => visualization.fillFn(d);
}

export function buildFillPalette(state: State): PatternPalette {
  const { svgPatternIds } = state.calculated.svgPatterns;
  const { neutralColour } = themedColours(state.config);
  return buildPatternPalette(svgPatternIds, neutralColour);
}

// The nested levels followed by the shared default slot, in the order geometry.ts's `outlineLevel`
// indexes them.
export function buildNestingStyle(state: State): NestingStyle {
  const { config } = state;
  const theme = themedColours(config);
  return {
    widths: [...config.nesting.nestedWidths, config.nesting.defaultWidth],
    strokeColours: [...theme.nestedStrokes, theme.defaultStroke],
  };
}

// `config` with the nesting-relevant fields (`config.nesting` and the current theme's
// `nestedStrokes`/`defaultStroke`) blanked out, so isNestingOnlyChange can isEqual the rest of
// `config` without those fields' own changes masking the comparison.
function withoutNestingStyle(config: Config): unknown {
  const theme = config.colours.currentTheme;
  return {
    ...config,
    nesting: undefined,
    colours: {
      ...config.colours,
      [theme]: {
        ...config.colours[theme],
        nestedStrokes: undefined,
        defaultStroke: undefined,
      },
    },
  };
}

// True when a `config` change touches only nesting colours/widths (the `setLines` action - see
// state.ts) and nothing else - the one case GlRenderer.setNestingStyle() can handle as a pure
// uniform update with no colour-buffer upload. A theme switch also moves
// `nestedStrokes`/`defaultStroke`, but it moves everything else too, so it correctly falls through
// to setColours() instead.
export function isNestingOnlyChange(
  prevConfig: Config,
  nextConfig: Config
): boolean {
  const prevTheme = themedColours(prevConfig);
  const nextTheme = themedColours(nextConfig);
  const nestingChanged =
    !_.isEqual(prevConfig.nesting, nextConfig.nesting) ||
    !_.isEqual(prevTheme.nestedStrokes, nextTheme.nestedStrokes) ||
    prevTheme.defaultStroke !== nextTheme.defaultStroke;
  return (
    nestingChanged &&
    _.isEqual(withoutNestingStyle(prevConfig), withoutNestingStyle(nextConfig))
  );
}
