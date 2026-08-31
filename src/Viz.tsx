// I use wildcard import for things that are not obviously d3 like "d3.color()"
import * as d3 from "d3";
import { HierarchyNode, Selection } from "d3";
import _ from "lodash";
import React, { RefObject, useEffect, useMemo, useRef } from "react";

import { DefaultProps } from "./components.types";
import { CouplingLink } from "./model/coupling";
import { nodeCircleAncestors } from "./model/nodeAccessors";
import { FeatureFlags, TreeNode } from "./polyglot_data.types";
import { State } from "./state";
import { Action } from "./state/actions";
import { themedColours } from "./state/colours";
import { VizMetadata } from "./viz.types";
import {
  attachZoom,
  layoutSize,
  refitCamera,
  watchContextLoss,
  watchViewport,
} from "./viz/cameraWiring";
import { drawCoupling, updateCoupling } from "./viz/couplingArcs";
import { drawTimescale } from "./viz/timescale";
import { VizRefs } from "./viz/vizRefs";
import { selectNodesToDraw } from "./vizNodeSelection";
import VizTooltip from "./VizTooltip";
import {
  buildFillFn,
  buildFillPalette,
  buildNestingStyle,
  isNestingOnlyChange,
} from "./vizUpdatePaths";
import { screenToWorld } from "./webgl/camera";
import { GlRenderer } from "./webgl/GlRenderer";

const redrawSelection = (
  svgSelection: Selection<
    SVGPathElement,
    HierarchyNode<TreeNode>,
    SVGGElement,
    unknown
  >,
  state: State
) => {
  const { config } = state;

  const strokeWidthFn = (d: HierarchyNode<TreeNode>) => {
    const nesting = d.depth - nodeCircleAncestors(d.data);
    if (nesting < 0) return 0;
    if (nesting >= config.nesting.nestedWidths.length)
      return config.nesting.defaultWidth;
    return config.nesting.nestedWidths[nesting] || config.nesting.defaultWidth;
  };

  return svgSelection
    .attr("d", (d) => {
      return `${d3.line()(d.data.layout.polygon)}z`;
    })
    .style("stroke-width", strokeWidthFn)
    .style("stroke", themedColours(config).selectedStroke)
    .style("fill", "none")
    .style("vector-effect", "non-scaling-stroke"); // so zooming doesn't make thick lines
};

function findSelectionPath(
  state: State,
  nodesByPath: Map<string, HierarchyNode<TreeNode>>
): HierarchyNode<TreeNode>[] {
  if (!state.config.selectedNode) return [];

  // This is where we need to go from a node path to the hierarchy!
  // or can we store this index elsewhere - when we build the hierarchy,
  // map paths to HierarchyNode<TreeNode> once and carry that around.

  let node: HierarchyNode<TreeNode> | undefined = nodesByPath.get(
    state.config.selectedNode
  );
  if (node === undefined) {
    console.error(
      "Hierarchy data not yet linked while finding selection! Ignoring"
    );
    return [];
  }
  const results: HierarchyNode<TreeNode>[] = [];
  while (node.parent) {
    results.push(node);
    node = node.parent;
  }
  results.push(node);
  return results.reverse();
}

const update = (
  refs: VizRefs,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State,
  nestingOnlyChange: boolean
) => {
  if (!refs.overlaySvg.current) {
    throw new Error("No current container");
  }
  const svg = d3.select(refs.overlaySvg.current);
  const glCanvas = refs.glCanvas.current;
  const camera = refs.camera.current;
  const glRenderer = refs.glRenderer.current;
  const visibleNodes = refs.visibleNodes.current;
  if (!glCanvas || !camera || !glRenderer || !visibleNodes) {
    throw new Error(
      "update called before draw, so the WebGL renderer is not ready"
    );
  }
  // A cheap `config` change never touches geometry or the picking index. Anything that can move
  // fill colour (visualisation, date range, teams, theme) rewrites the colour buffer; a
  // nesting-only edit skips even that, since level is a per-vertex attribute and the widths and
  // colours it indexes are uniforms. The nesting uniforms are then rewritten either way - on the
  // colour path because a theme switch moves nestedStrokes/defaultStroke too.
  if (!nestingOnlyChange) {
    glRenderer.setColours(
      visibleNodes,
      buildFillFn(metadata, features, state),
      buildFillPalette(state)
    );
  }
  glRenderer.setNestingStyle(buildNestingStyle(state));
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  // TODO: DRY this up - or should selecting just be expensive config?
  if (!metadata.hierarchyNodesByPath) {
    throw new Error(
      "update called before draw, so we have no hierarchyNodesByPath!"
    );
  }
  const selectionPath = findSelectionPath(state, metadata.hierarchyNodesByPath);
  const group: Selection<
    SVGGElement,
    HierarchyNode<TreeNode>,
    SVGSVGElement,
    unknown
  > = svg.selectAll(".topGroup");
  const selectionNodes = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".selected")
    .data(selectionPath, (node) => node.data.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), state);
  selectionNodes.exit().remove();
};

const draw = (
  refs: VizRefs,
  files: TreeNode,
  metadata: VizMetadata,
  features: FeatureFlags,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  const { expensiveConfig } = state;

  if (!refs.overlaySvg.current) {
    console.warn("in draw but d3container not yet current");
    return;
  }
  const chartStackEl = refs.chartStack.current;
  const glCanvas = refs.glCanvas.current;
  if (!chartStackEl || !glCanvas) {
    console.warn("in draw but canvas layer not yet mounted");
    return;
  }
  const vizEl = refs.overlaySvg.current;
  const w = chartStackEl.clientWidth;
  const h = chartStackEl.clientHeight;

  const layout = layoutSize(files);
  const camera = refitCamera(refs, layout);
  if (!camera) {
    console.warn("in draw but canvas layer not yet mounted");
    return;
  }
  if (!refs.glRenderer.current) {
    refs.glRenderer.current = new GlRenderer(glCanvas);
  }
  const glRenderer = refs.glRenderer.current;

  const svg = d3
    .select(vizEl)
    .attr("viewBox", [
      -layout.width / 2,
      -layout.height / 2,
      layout.width,
      layout.height,
    ]);
  const group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown> =
    svg.selectAll(".topGroup");
  const rootNode = d3.hierarchy(files); // .sum(d => d.value);

  const hierarchyNodesByPath: Map<string, HierarchyNode<TreeNode>> = new Map();
  rootNode.descendants().forEach((node) => {
    hierarchyNodesByPath.set(node.data.path, node);
  });
  metadata.hierarchyNodesByPath = hierarchyNodesByPath;

  const { fills, outlines } = selectNodesToDraw(
    rootNode,
    expensiveConfig.depth
  );
  refs.visibleNodes.current = fills;
  refs.outlineNodes.current = outlines;

  glRenderer.setGeometry(
    fills,
    outlines,
    buildFillFn(metadata, features, state),
    buildNestingStyle(state),
    buildFillPalette(state)
  );
  glRenderer.setTransform(camera, glCanvas.width, glCanvas.height);
  glRenderer.draw();

  const selectionPath = findSelectionPath(state, metadata.hierarchyNodesByPath);
  const selectionNodes = group
    .selectAll<SVGPathElement, HierarchyNode<TreeNode>>(".selected")
    .data(selectionPath, (node) => node.data.path);

  const newSelectionNodes = selectionNodes
    .enter()
    .append("path")
    .classed("selected", true);

  redrawSelection(selectionNodes.merge(newSelectionNodes), state);

  selectionNodes.exit().remove();

  drawCoupling(group, files, metadata, state, dispatch);

  // if we are redrawing after expensive config change, need to force coupling nodes to the front!
  // TODO: better would be to use a different top-level group...
  group.selectAll(".coupling").raise();

  attachZoom(refs, chartStackEl, group, camera, w, h);
};

// see https://stackoverflow.com/questions/53446020/how-to-compare-oldvalues-and-newvalues-on-react-hooks-useeffect
function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const updateBodyTheme = (newTheme: string) => {
  document.body.dataset.theme = newTheme;
};

const Viz = ({ dataRef, state, dispatch }: DefaultProps) => {
  const d3TimescaleContainer: RefObject<SVGSVGElement | null> =
    useRef<SVGSVGElement | null>(null);
  const vizContainerRef: RefObject<HTMLElement | null> =
    useRef<HTMLElement | null>(null);
  const vizTooltipRef: RefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null);

  // Stable for the component's lifetime: every field is a ref, and useRef never changes identity.
  const refs = useRef<VizRefs>({
    overlaySvg: { current: null },
    glCanvas: { current: null },
    chartStack: { current: null },
    camera: { current: null },
    glRenderer: { current: null },
    visibleNodes: { current: null },
    outlineNodes: { current: null },
  }).current;

  // A full redraw bound to the latest data and state, refreshed by the main effect below. The GL
  // context-loss handler needs to rebuild everything from scratch, but it is registered once and
  // so can't close over either.
  const redrawAllRef = useRef<(() => void) | null>(null);

  const debouncedDispatch = useMemo(
    () => _.debounce((nextValue) => dispatch(nextValue), 250),
    [dispatch] // will be created only once
  );

  const prevState = usePrevious(state);

  // Releases the GL context's buffers and programs on unmount - `draw()` creates the renderer
  // lazily on the ref, so there's nothing to clean up if it was never mounted. Empty deps: this
  // must run its cleanup exactly once, on unmount, not after every render.
  useEffect(() => {
    return () => {
      // refs.glRenderer.current is set imperatively by draw() outside React's render cycle
      // (CLAUDE.md: react-hooks/refs is off repo-wide for the same reason), so reading it fresh
      // at unmount is correct, not stale.
      refs.glRenderer.current?.destroy();
    };
  }, [refs]);

  useEffect(() => {
    const {
      metadata: { timescaleData },
      metadata,
      data,
    } = dataRef.current;
    const { config, expensiveConfig, couplingConfig } = state;
    const { features } = data;
    redrawAllRef.current = () =>
      draw(refs, data.tree, metadata, features, state, dispatch);
    if (
      prevState === undefined ||
      !_.isEqual(prevState.expensiveConfig, expensiveConfig)
    ) {
      console.log("expensive config change - rebuild all");
      console.time("redraw");
      draw(refs, data.tree, metadata, features, state, dispatch);
      console.timeEnd("redraw");
      console.time("redrawTimescale");
      drawTimescale(
        d3TimescaleContainer,
        timescaleData,
        features,
        state,
        debouncedDispatch
      );
      console.timeEnd("redrawTimescale");
      updateBodyTheme(state.config.colours.currentTheme);
    } else {
      if (!_.isEqual(prevState.config, config)) {
        const nestingOnlyChange = isNestingOnlyChange(prevState.config, config);
        console.log(
          nestingOnlyChange
            ? "nesting-only change - uniform update"
            : "cheap config change - just redraw"
        );
        console.time("update");
        update(refs, metadata, features, state, nestingOnlyChange);
        console.timeEnd("update");
        if (
          prevState.config.colours.currentTheme !==
          state.config.colours.currentTheme
        ) {
          updateBodyTheme(state.config.colours.currentTheme);
        }
      }
      if (!_.isEqual(prevState.couplingConfig, couplingConfig)) {
        console.log("coupling change");
        console.time("update coupling");
        updateCoupling(
          refs.overlaySvg.current,
          data.tree,
          metadata,
          state,
          dispatch
        );
        console.timeEnd("update coupling");
      }
    }
  }, [dataRef, state, dispatch, debouncedDispatch, prevState, refs]);

  // Keeping the canvas correct when the viewport or the GL context changes underneath it - both
  // watchers, and their teardown, live in cameraWiring.ts.
  useEffect(() => watchViewport(refs, dataRef), [dataRef, refs]);

  useEffect(() => watchContextLoss(refs, redrawAllRef), [refs]);

  // The canvas owns pointer events (see main_areas.scss - the overlay is pointer-events: none
  // except .coupling). A native listener rather than a React `onClick` prop because `screenToWorld`
  // and `pick` both need the *current* camera/renderer, which live in refs, not props or state -
  // this is attached once and reads `.current` fresh on every click.
  useEffect(() => {
    const canvas = refs.glCanvas.current;
    if (!canvas) return;

    const handleClick = (event: MouseEvent) => {
      const camera = refs.camera.current;
      const glRenderer = refs.glRenderer.current;
      if (!camera || !glRenderer) return;
      const rect = canvas.getBoundingClientRect();
      const [worldX, worldY] = screenToWorld(
        camera,
        event.clientX - rect.left,
        event.clientY - rect.top
      );
      const picked = glRenderer.pick(worldX, worldY);
      if (picked) {
        dispatch({ type: "selectNode", payload: picked.data.path });
      }
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [dispatch, refs]);

  // Hover tooltip. Picking on every raw `mousemove` would run a quadtree search on every pixel the
  // cursor crosses; instead the latest event is stashed in a ref and a single `pick()` runs once
  // per animation frame (`rafId` guards against scheduling more than one). The DOM is only touched
  // when the picked node's path actually changes - sweeping the mouse across one large cell
  // shouldn't touch the DOM every frame - but the tooltip still tracks the cursor position on
  // every throttled tick, since it must move even while the picked node stays the same.
  useEffect(() => {
    const canvas = refs.glCanvas.current;
    const tooltip = vizTooltipRef.current;
    const container = vizContainerRef.current;
    if (!canvas || !tooltip || !container) return;

    let rafId: number | null = null;
    let lastEvent: MouseEvent | null = null;
    let lastPath: string | null = null;

    const updateTooltip = () => {
      rafId = null;
      const event = lastEvent;
      if (!event) return;
      const camera = refs.camera.current;
      const glRenderer = refs.glRenderer.current;
      if (!camera || !glRenderer) return;

      const canvasRect = canvas.getBoundingClientRect();
      const [worldX, worldY] = screenToWorld(
        camera,
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top
      );
      const picked = glRenderer.pick(worldX, worldY);
      const path = picked?.data.path ?? null;

      if (path !== lastPath) {
        lastPath = path;
        tooltip.hidden = path === null;
        if (path !== null) {
          tooltip.textContent = path;
        }
      }
      if (path !== null) {
        const containerRect = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - containerRect.left}px`;
        tooltip.style.top = `${event.clientY - containerRect.top}px`;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      lastEvent = event;
      if (rafId === null) {
        rafId = requestAnimationFrame(updateTooltip);
      }
    };

    const handleMouseLeave = () => {
      lastEvent = null;
      lastPath = null;
      tooltip.hidden = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [refs]);

  return (
    <aside className="Viz" ref={vizContainerRef}>
      <div className="chart-stack" ref={refs.chartStack}>
        <canvas className="chart-gl" ref={refs.glCanvas} />
        <svg className="chart-overlay" ref={refs.overlaySvg}>
          <defs>
            {/* arrowhead marker definition */}
            <marker
              id="arrow"
              viewBox="0 0 4 4"
              refX="2"
              refY="2"
              markerWidth="5"
              markerHeight="5"
              markerUnits="strokeWidth"
              // xoverflow="visible"  TODO: this was here and invalid - check
              overflow="visible"
              orient="auto-start-reverse"
            >
              <path d="M0,0L4,2L0,4z" fill="#ff6300" />
            </marker>
          </defs>
          <g className="topGroup" />
        </svg>
      </div>
      <VizTooltip ref={vizTooltipRef} />
      <svg className="timescale" ref={d3TimescaleContainer} />
    </aside>
  );
};

export default Viz;
