import { RefObject } from "react";

// Viz.tsx owns all the hover behaviour - position, text, visibility - writing to this node
// directly via `ref` on every rAF-throttled pick, the same imperative-DOM pattern it uses for the
// canvas and camera, rather than routing mousemove-driven state through React re-renders.
const VizTooltip = ({ ref }: { ref: RefObject<HTMLDivElement | null> }) => {
  return <div className="viz-tooltip" ref={ref} hidden />;
};

export default VizTooltip;
