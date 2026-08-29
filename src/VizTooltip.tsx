import { RefObject } from "react";

// A single positioned div, replacing the SVG-era per-node `<title>` tooltip (plan.md step 6):
// today's 22,209 `svg:title` elements become one DOM node, and it appears instantly instead of
// after the ~1s native SVG tooltip delay. Viz.tsx owns all the hover behaviour - position, text,
// visibility - writing to this node directly via `ref` on every rAF-throttled pick, the same
// imperative-DOM pattern it already uses for the canvas and camera, rather than routing
// mousemove-driven state through React re-renders. Starts `hidden` so nothing shows before the
// first hover.
const VizTooltip = ({ ref }: { ref: RefObject<HTMLDivElement | null> }) => {
  return <div className="viz-tooltip" ref={ref} hidden />;
};

export default VizTooltip;
