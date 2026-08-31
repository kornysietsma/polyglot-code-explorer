// The coupling arcs: the curved SVG links between files that the scanner saw changing together.
//
// They are SVG overlay geometry, not GL, so they live here rather than in `src/webgl/` - the
// arcs, the selection outline and the timescale brush are the three things `Viz.tsx` still draws
// as DOM on top of the canvas. `model/coupling.ts` decides *which* pairs are linked; this module
// decides what those links look like.
//
// The pure half - which links to draw, the arc's path data, and the stroke, width and label each
// link gets - is separated from the D3 selection code below it, and is what the tests reach.

import * as d3 from "d3";
import { Selection } from "d3";
import React from "react";

import {
  CouplingLink,
  nodeCouplingFilesFiltered,
  nodeHasCouplingData,
} from "../model/coupling";
import { nodeCenter, nodeDescendants } from "../model/nodeAccessors";
import { Point, TreeNode } from "../polyglot_data.types";
import { State } from "../state";
import { Action } from "../state/actions";
import { themedColours } from "../state/colours";
import { Config } from "../state/config";
import { VizMetadata } from "../viz.types";

// flatten out all nodes for coupling line display
export function normalizedCouplingNodes(
  rootNode: TreeNode,
  state: State
): CouplingLink[] {
  const { config, couplingConfig } = state;
  const {
    dateRange: { earliest, latest },
  } = config.filters;
  return couplingConfig.shown === false
    ? []
    : nodeDescendants(rootNode)
        .filter(nodeHasCouplingData)
        .map(
          (d) =>
            nodeCouplingFilesFiltered(
              d,
              earliest,
              latest,
              couplingConfig.minRatio,
              couplingConfig.minBursts,
              couplingConfig.maxCommonRoots
            ) ?? []
        )
        .flat();
}

export function arcPath(leftHand: boolean, source: Point, target: Point) {
  const x1 = leftHand ? source[0] : target[0];
  const y1 = leftHand ? source[1] : target[1];
  const x2 = leftHand ? target[0] : source[0];
  const y2 = leftHand ? target[1] : source[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dr = Math.sqrt(dx * dx + dy * dy);
  const sweep = leftHand ? 0 : 1;
  const xRotation = 0;
  const largeArc = 0;

  return `M${x1},${y1}A${dr}, ${dr} ${xRotation}, ${largeArc}, ${sweep} ${x2},${y2}`;
}

// The arc's own `d`, looking the target up by path - the link only stores the target's name.
export function couplingArcPath(
  link: CouplingLink,
  nodesByPath: Map<string, TreeNode>
) {
  const sourcePos = nodeCenter(link.source);
  const target = nodesByPath.get(link.targetFile);
  const targetPos = target ? nodeCenter(target) : undefined;
  if (sourcePos == undefined || targetPos == undefined) {
    throw new Error("Can't find source or target for coupling line");
  }

  return arcPath(true, sourcePos, targetPos);
}

// The stronger the coupling, the more opaque and the thicker the arc.
export function couplingArcStroke(link: CouplingLink, config: Config) {
  const colour = d3.color(themedColours(config).couplingStroke);
  if (colour == null) {
    throw new Error("Invalid colour in theme");
  }
  const ratio = link.targetCount / link.sourceCount;
  colour.opacity = ratio;
  return colour.toString();
}

export function couplingArcWidth(link: CouplingLink) {
  const ratio = link.targetCount / link.sourceCount;
  if (ratio >= 0.95) return "3px";
  if (ratio > 0.8) return "2px";
  return "1px";
}

export function couplingArcLabel(link: CouplingLink) {
  const ratio = link.targetCount / link.sourceCount;
  const from = link.source.path;
  return `${from} -> ${link.targetFile} (${ratio.toFixed(3)})`;
}

export function drawCoupling(
  group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown>,
  files: TreeNode,
  metadata: VizMetadata,
  state: State,
  dispatch: React.Dispatch<Action>
) {
  const { config } = state;
  const { nodesByPath } = metadata;
  const allCouplingNodes = normalizedCouplingNodes(files, state);

  const couplingNodes = group
    .selectAll<SVGPathElement, CouplingLink>(".coupling")
    .data(
      allCouplingNodes,
      (node) => node.source.path + "->" + node.targetFile
    );

  // TODO - consider reworking this with join which seems to be the new hotness?
  const newCouplingNodes = couplingNodes
    .enter()
    .append("path")
    .classed("coupling", true);

  couplingNodes
    .merge(newCouplingNodes)
    .attr("d", (d) => couplingArcPath(d, nodesByPath))
    .attr("marker-end", "url(#arrow)") // sadly the marker colour is fixed!
    .style("stroke", (d) => couplingArcStroke(d, config))
    .style("stroke-width", couplingArcWidth)
    .style("fill", "none")
    .style("vector-effect", "non-scaling-stroke")
    .on(
      "click",
      function (this: SVGPathElement, event: PointerEvent, node: CouplingLink) {
        dispatch({ type: "selectNode", payload: node.source.path });
      }
    )
    .append("svg:title")
    .text(couplingArcLabel);

  couplingNodes.exit().remove();
}

// Takes the overlay element rather than `Viz.tsx`'s whole ref bundle: the arcs need only the one
// layer they are drawn on, and depending on the bundle would make this module import `Viz.tsx`.
export const updateCoupling = (
  overlaySvg: SVGSVGElement | null,
  files: TreeNode,
  metadata: VizMetadata,
  state: State,
  dispatch: React.Dispatch<Action>
) => {
  if (!overlaySvg) {
    throw new Error("No current container");
  }
  const svg = d3.select(overlaySvg);
  const group: Selection<SVGGElement, CouplingLink, SVGSVGElement, unknown> =
    svg.selectAll(".topGroup");
  drawCoupling(group, files, metadata, state, dispatch);
};
