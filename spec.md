# Spec: replace the SVG visualisation renderer with WebGL

Status: ready to implement. Branch `performance-improvements`.

## Problem

Pan and zoom on a large data file is unusable. Measured on `data/openmrs.json`
(33,931 nodes) in headed Chrome, Intel UHD 630, DPR 1, synthetic pan+zoom over 30-40 frames:

| Approach | ms/frame |
|---|---|
| **Current SVG (`transform` attr on `<g>`)** | **2222** |
| SVG minus `non-scaling-stroke` | 1701 |
| SVG minus the whole nesting layer | 1073 |
| SVG with no strokes at all | 429 |
| SVG, every tweak combined | 445 |
| Canvas 2D, batched by colour, cached `Path2D` | 179 |
| **WebGL, one static buffer, one draw call** | **16.6 (vsync-capped)** |

The cost is re-rasterising ~56,000 vector paths on the CPU every frame. The SVG
`transform` attribute invalidates the whole subtree, and Skia does not cache it.
Strokes dominate (2222 -> 429 ms just by removing them). Canvas 2D is not enough.

`data/spring-projects.json` (80,691 nodes) is the real target and is ~3.6x larger again.

See `docs/rendering-performance.md` for the full investigation, the options rejected,
and the caveats on these numbers.

## Goal and success criteria

1. Sustained 60 fps (<=16.7 ms/frame) pan and zoom on `data/spring-projects.json`.
2. Visual parity with the SVG renderer: the Playwright screenshot suite is the judge.
   Small, explicable deltas are acceptable if deliberately re-baselined (see
   "Expected visual deltas" below); unexplained ones are bugs.
3. No regression in click-to-select, tooltips, selection outlines, coupling arcs,
   the timescale brush, or any control-panel interaction.
4. One-time geometry build under ~1 s on 80k nodes.
5. Switching visualisation (LOC -> churn -> team) stays interactive: target <50 ms.

## Decisions already made

1. **Replace the SVG cell/nesting rendering outright.** No runtime toggle, no
   abstraction layer over two renderers. The git branch is the way back.
2. **Raw WebGL 1 + `d3-quadtree` picking. No new runtime dependencies.**
   Rejected: deck.gl (brings its own `OrthographicView` camera that competes with
   `d3.zoom`, ~1 MB bundle, geo-oriented machinery for one static draw call);
   regl (small dependency for modest convenience); Canvas 2D (measured, too slow).
3. **Picking returns the leaf node under the cursor.** Today, clicking a directory's
   border stroke selects the *directory*, because `.nesting` paths are `fill: none`
   and painted after `.cell` paths. That is emergent from paint order, not designed.
   It is dropped deliberately. Directories are still selectable via the Inspector
   breadcrumb and the depth control.

## Current architecture: facts the implementation needs

All line references are `src/Viz.tsx` unless stated.

- `draw()` (L338) builds two path layers inside `g.topGroup`:
  - **`.cell`** (L391-414): `rootNode.descendants()` filtered to
    `depth <= expensiveConfig.depth` and (`children === undefined` || at the depth
    limit). Gets `fill` from the visualisation, plus a `defaultStroke` /
    `defaultWidth` stroke, plus a `click` handler and an `svg:title` child.
  - **`.nesting`** (L416-445): descendants filtered to
    `depth >= 1 + circleAncestors && depth <= expensiveConfig.depth`, **sorted
    depth-descending** so shallower (wider) strokes paint last. `fill: none`,
    stroke colour/width by nesting level. Gets a `click` handler.
- On `openmrs.json` this is **22,209 cells + 33,675 nesting + 22,209 `<title>` =
  78,097 SVG elements**, ~457k polygon vertices.
- **19,101 of the 33,675 nesting paths are pixel-identical to a `.cell` already
  drawn** (same geometry, same stroke colour, same width). The new design
  eliminates this by construction: one outline per node.
- Nesting level formula, used in both `redrawNesting` (L76, L84) and
  `redrawSelection` (L114) with a deliberate 1-level offset between them:
  ```
  nestingLevel = d.depth - (nodeCircleAncestors(d.data) + 1)   // nesting strokes
  selectionLevel = d.depth - nodeCircleAncestors(d.data)       // selection strokes
  ```
  `level < 0` -> not drawn. `level >= nestedWidths.length` (4) -> default. See
  CLAUDE.md on `circleAncestors` and why `nodeCircleAncestors` throws rather than
  defaulting to 0.
- Defaults (`src/state.ts` L427-433): `defaultWidth: 1`, `nestedWidths: [2,2,1,1]`,
  `nestedStrokes` 4 colours per theme. All are **live-editable** in
  `ColoursAndLinesControls.tsx` (reducer at `state.ts` L961-966).
- `BaseVisualization.fillFn` (`src/visualizations/BaseVisualization.tsx` L86)
  returns a **CSS colour string**, after `overrideColourFunction` handles
  circle-pack backgrounds and not-yet-created files.
- **Exception:** `TeamPatternVisualization.scale` returns `` `url(#pattern${v})` ``
  - an SVG paint-server reference, not a colour. This is the only visualisation
  that is not a flat fill. See "Team pattern visualisation" below.
- `update()` (L159, called at L677 on cheap config change) calls `redrawPolygons`,
  which **re-sets `.attr("d", ...)` on every path** (L55-57) even when only the
  colour changed. Switching visualisation currently rewrites 22k path geometries
  for nothing. The new design fixes this.
- `state.ts` already splits `config` (cheap: colours, visualisation, date range,
  teams) from `expensiveConfig` (currently just `depth`). This maps directly onto
  the three update paths below.

## Target architecture

```
<aside class="Viz">
  <canvas class="chart-gl">      <- WebGL: all fills + all outlines
  <svg   class="chart-overlay">  <- transparent, on top, pointer-events: none
     <defs> arrow marker </defs>
     <g class="topGroup">        <- same viewBox + same transform as the canvas
        .selected paths          <- ancestor chain only, a handful of elements
        .coupling paths          <- only when coupling is enabled
  <div class="viz-tooltip">      <- HTML tooltip, replaces svg:title
  <svg class="timescale">        <- UNCHANGED
```

The canvas takes pointer events. The overlay is `pointer-events: none` except
`.coupling` paths, which keep their own click handler and `<title>`.

`d3.zoom` stays attached and remains the single source of truth for the transform.
Its handler updates a uniform *and* sets `transform` on the overlay's `g.topGroup`,
so the two layers stay locked. The overlay has few enough elements that the SVG
transform cost is irrelevant there.

### Module layout

```
src/webgl/
  GlRenderer.ts   - context, program, buffers, uniforms, draw(); the only stateful object
  geometry.ts     - buildFills(), buildOutlines(): TreeNode[] -> typed arrays
  triangulate.ts  - fanTriangulate() + assertConvex()
  colours.ts      - parseCssColour() -> [r,g,b], memoised; palette texture for patterns
  picking.ts      - buildIndex(), pick(worldX, worldY) via d3-quadtree
  shaders.ts      - vertex/fragment source as template strings
src/VizTooltip.tsx - HTML tooltip component
src/Viz.tsx        - orchestration; keeps the SVG overlay, selection, coupling, timescale
```

`redrawSelection`, `drawCoupling`, `findSelectionPath`, `drawTimescale` and
`arcPath` all stay in `Viz.tsx` unchanged. `redrawPolygons` and `redrawNesting`
are deleted.

## Geometry pipeline

### Fills

One triangle fan per polygon. **Voronoi cells and circle approximations are
convex, so a fan is an exact triangulation** - no earcut needed.

```
for each cell polygon with points p[0..n-1]:
    for i in 1..n-2:
        emit triangle (p[0], p[i], p[i+1])
```

Measured on openmrs: 22,209 polygons -> 282,243 triangle vertices, 129 ms to
build, 26 ms to upload, 5.6 MB. Extrapolating to spring-projects: ~470 ms and
~20 MB. Acceptable as a one-off.

`assertConvex()` must run in development builds and throw on a concave polygon.
Silent fan-triangulation of a concave polygon renders subtly wrong rather than
failing, which is exactly the failure mode CLAUDE.md warns about for
`nodeCircleAncestors`. Guard it the same way.

### Outlines

`gl.LINES` with `lineWidth > 1` is unreliable - most drivers clamp it to 1. Expand
strokes into triangles instead, and offset in the vertex shader so the width is
constant in screen space. That reproduces `vector-effect: non-scaling-stroke`
exactly, and unlike the SVG version it costs nothing per frame.

For each polygon in the outline set, for each edge (a, b):

```
n = normalize(perp(b - a))
emit 4 vertices: (a, +n), (a, -n), (b, +n), (b, -n)
emit 6 indices:  2 triangles
```

Per-vertex attributes: `a_pos` (vec2, world), `a_normal` (vec2, already signed),
`a_level` (float, 0-4).

Vertex shader offsets by `a_normal * (u_widths[level] * 0.5 * u_dpr) / u_scale`,
where `u_scale` is the current world->device-pixel scale. Colour comes from
`u_strokeColours[level]`, a `uniform vec3[5]`.

**The outline set is the union of the cell set and the nesting set, one outline
per node** - this is what removes the 19,101 redundant paths. Level assignment:

```
level = depth - (circleAncestors + 1)
if level < 0 or level >= 4: use index 4 (defaultStroke / defaultWidth)
else: use index level (nestedStrokes[level] / nestedWidths[level])
```

**Preserve the existing depth-descending sort** when writing the index buffer, so
shallower/wider outlines paint over deeper ones exactly as they do today.

Because widths and colours are uniform-array lookups keyed by a per-vertex level
byte, **editing nesting colours or widths in the UI becomes a uniform update with
no buffer re-upload at all.**

Budget: at 80k nodes the outline buffer is the big one - roughly 1.3M vertices at
openmrs scale, ~26 MB with level-byte packing, so ~90 MB at spring-projects scale.
If that proves too heavy, pack `a_normal` as two `Int16` and the level as a
`Uint8` via `vertexAttribPointer` normalisation before reaching for anything
cleverer.

### Draw order

Painter's algorithm, no depth buffer: all fills, then all outlines.
`antialias: true` in the context attributes. Blending: standard alpha, though all
current colours are opaque.

## The three update paths

This is the core of the design and the reason to keep positions and colours in
**separate buffers**.

| Trigger | Work | Target |
|---|---|---|
| Pan / zoom (`d3.zoom`) | write `u_scale`, `u_translate`; set overlay `<g>` transform | every frame, ~0 ms |
| Cheap `config` change: visualisation, date range, theme, teams, nesting colours | rewrite **colour buffer only** (or, for nesting colours/widths, just uniforms). Positions untouched. | <50 ms |
| `expensiveConfig` change (depth), or any future runtime re-layout | re-triangulate, re-upload positions *and* colours, rebuild the picking index | 100-500 ms |

Expose these as three distinct methods on `GlRenderer` - `setTransform()`,
`setColours(fillFn)`, `setGeometry(nodes)` - rather than one `render()`.
`setGeometry` must reallocate rather than patch in place, because a future
re-layout can change a polygon's vertex count.

The `useEffect` in `Viz.tsx` (L647-693) already discriminates these cases via
`_.isEqual` on `expensiveConfig` / `config` / `couplingConfig`. Keep that shape and
route each branch to the matching method.

## Picking

`d3-quadtree` (already available via the `d3` dependency) over **cell polygon
centroids** (`node.layout.center`), built in `setGeometry`.

```
pick(worldX, worldY):
    candidate = quadtree.find(worldX, worldY)
    if candidate and pointInConvexPolygon(candidate, x, y): return candidate
    // nearest centroid is not always the containing cell for clipped/weighted cells
    for each of the ~16 nearest centroids (quadtree.visit with a growing bbox):
        if pointInConvexPolygon(...): return it
    return null   // background click
```

`pointInConvexPolygon` is a sign-consistency check across all edges - a few dot
products, exact for convex polygons.

Screen -> world conversion must invert the same transform the shader applies
(viewBox fit + `d3.zoom` transform + DPR). Factor that into a single
`screenToWorld()` used by both click and hover so they cannot drift apart.

**Documented fallback:** if quadtree picking proves flaky at the edges of clipped
cells, switch to GPU picking - render polygon index as an RGB colour into an
offscreen framebuffer and `gl.readPixels(x, y, 1, 1)`. That is pixel-exact by
construction and handles any future concave geometry, at the cost of a pipeline
sync per pick. Fine for clicks; less good for per-mousemove hover.

## Interaction

- **Click** -> `pick()` -> `dispatch({ type: "selectNode", payload: node.data.path })`.
  Identical to today (L401-410); everything downstream is untouched.
- **Hover** -> `pick()` throttled to one call per `requestAnimationFrame`, and only
  update the tooltip when the picked node changes.
- **Tooltip** -> replaces the 22,209 `svg:title` elements with a single positioned
  HTML div showing `node.data.path`. This is a net improvement: native SVG
  tooltips have a ~1 s delay, cannot be styled, and cost 22k DOM nodes. Keep the
  text identical to today for now so screenshots stay comparable.
- **Coupling arcs** keep their existing SVG `click` handler and `<title>`.

## DPR and resize

The SVG got this free via `viewBox`; the canvas does not.

- `canvas.width = clientWidth * devicePixelRatio`, `canvas.height = clientHeight * devicePixelRatio`;
  CSS size stays in layout pixels. `gl.viewport(0, 0, canvas.width, canvas.height)`.
- **Stroke widths are specified in CSS pixels and must be multiplied by DPR** when
  converted to device pixels, or every line is half-width on a Retina display.
- Attach a `ResizeObserver` to the container; on resize, resize the canvas,
  recompute the viewBox fit, update uniforms, redraw. No geometry rebuild needed.
- Note all benchmark numbers above were taken at DPR 1. SVG raster cost roughly
  quadruples at DPR 2; the WebGL number barely moves.

## Team pattern visualisation

`TeamPatternVisualization` returns `url(#patternN)`, resolved against the
`<linearGradient>` defs built in `svgPatternDefs()` (L695-742): a 3-colour diagonal
stripe, `gradientUnits="userSpaceOnUse"`, `x2="10"`, `spreadMethod="repeat"`,
`gradientTransform="rotate(-45)"` - so the stripes are in **world space and scale
with zoom**.

Reproduce in the fragment shader:

- Upload the palette as an `N x 1` RGB texture, 3 texels per pattern.
- Per-vertex `a_patternIndex` (float), used only when `u_patternMode` is set.
- Fragment: `stripe = floor(fract(dot(worldPos, vec2(cos(-PI/4), sin(-PI/4))) / 10.0) * 3.0)`
  then sample the palette at `patternIndex * 3 + stripe`.
- The world position must be interpolated from the vertex shader as a varying.

**Sequence this last.** Ship the first working renderer with `teamPattern` falling
back to the first colour of its triple (flat fill), and add the stripe shader as a
separate step. Everything else is independent of it.

## Expected visual deltas

Re-baseline these deliberately; anything else is a bug.

- **Stroke overpaint order.** Today a `.cell` fill can paint over an earlier
  `.cell`'s stroke. With all fills drawn before all outlines, outlines always win.
  Expect hairline differences on shared borders.
- **Directory-border clicks** now select the leaf, per decision 3.
- **Antialiasing.** GPU AA differs from Skia's. This is the one that makes
  screenshot baselines less portable across machines than they are today - worth
  knowing before re-baselining, given CLAUDE.md treats canvas diffs as real bugs.

## Out of scope

- Coupling arcs moving to WebGL. They stay SVG; they are only drawn when enabled
  and are arcs, not polygons. Revisit only if they measure as a problem.
- Runtime re-layout. The design deliberately leaves room for it (`setGeometry` is
  the single entry point) but implements nothing.
- The `<title>`-based accessibility story. A canvas is opaque to screen readers
  where SVG paths are DOM nodes. In practice 22k unlabelled paths are not
  navigable today either, but this is a genuine regression and should be recorded,
  not hidden.
- Regenerating `data/default.json`, and the other known follow-ups in CLAUDE.md.

## Open questions

1. Does the outline buffer at spring-projects scale (~90 MB) actually fit
   comfortably? Measure before optimising the packing.
2. Is quadtree picking accurate enough at clipped-cell edges, or is GPU picking
   needed? Decide by clicking around the real app.
3. Should the tooltip show more than the path (LOC, age, churn) now that it is
   cheap? Deliberately deferred to keep screenshot parity in the first pass.

## Verification

- **Unit (Vitest):** `fanTriangulate` vertex counts and winding; `assertConvex`
  rejects a known concave polygon; `pointInConvexPolygon` against hand-built cases
  including points exactly on an edge; nesting-level assignment against the
  formula above; `parseCssColour` for hex, rgb() and named colours.
- **Manual, via the `playwright-cli` skill** (CLAUDE.md: not a browser plugin):
  load `spring-projects`, confirm 60 fps pan/zoom, click-select, hover tooltip,
  depth changes, every visualisation, both themes, coupling on `default.json`.
- **Screenshot suite:** `npm run e2e`. Open every reported diff and decide, then
  re-baseline with `npm run e2e:update`. Per CLAUDE.md this is a review aid, not a
  pass/fail gate - but the deltas must all be explicable by the list above.
- **Perf:** re-run the frame-time benchmark from
  `docs/rendering-performance.md` against the new renderer and record the numbers.
- `npm run check` clean throughout.

## Next step

Run the `wf-2-create-plan` workflow against this spec to produce `plan.md` with
ordered, independently-verifiable steps. Fold anything durable back into
`CLAUDE.md` when the work lands, then delete `spec.md` and `plan.md` - git keeps
the history.
