# Plan: replace the SVG visualisation renderer with WebGL

Implements `spec.md`. Branch `performance-improvements`.

Read `spec.md` first — it holds the _what_ and _why_, the measured numbers, the
target architecture, and the list of expected visual deltas. This file is the
_how_: ordered steps, what "done" means for each, and how each is verified.

---

## Plan-level decisions

These are decisions about the _work_, not the design. The design decisions live in
`spec.md`.

1. **Walking skeleton first.** A canvas draws real fills by step 4, then picking,
   tooltip, outlines and the update paths layer on top. Integration risk (GL
   context creation, DPR, the viewBox fit, the zoom lock) lands in steps 1–4,
   while there is still almost nothing else to blame. Every step from 4 onward is
   verifiable by eye in the real app.

2. **Hard cutover — no renderer toggle, not even a temporary one.** `.cell` and
   `redrawPolygons` are deleted in step 4, `.nesting` and `redrawNesting` in
   step 7. Nothing renders a polygon twice, and there is no dead branch to
   remember to remove later.

   A/B comparison against the old renderer therefore needs a second checkout. A
   worktree rather than a clone, because the comparison target is not fixed: every
   commit made on this branch is immediately checkoutable there with no fetch, and
   git refuses to check out one branch in two worktrees, which keeps the two trees
   from being confused.

   The sibling directory is inside Dropbox, so the second tree's 356 MB
   `node_modules` must be marked ignored **before** `npm install` — the xattr needs
   the directory to exist, so `mkdir` it first:

   ```sh
   git worktree add ../explorer-svg fd71cf6      # last SVG-renderer commit
   cd ../explorer-svg
   mkdir node_modules && xattr -w com.dropbox.ignored 1 'node_modules'
   npm install
   npx vite --port 5174                          # old renderer
   # back in the main tree: npm start            # new renderer, port 5173
   ```

   The xattr is per-inode, so it is lost if `node_modules` is ever deleted and
   reinstalled — re-run it if that happens.

   Do this at the start of step 4 and keep both tabs open through step 9. The
   worktree is removed in step 12 (`git worktree remove ../explorer-svg`).

3. **Screenshot baselines stay frozen until step 11.** The committed baselines are
   the SVG reference. From step 4 the suite will report diffs on every
   visualisation shot — that is expected, and it is _not_ run as a gate during
   steps 4–10. Step 11 opens every diff, justifies each one against the "Expected
   visual deltas" list in `spec.md`, and re-baselines exactly once. Any diff that
   cannot be explained from that list is a bug to fix before re-baselining.

   This is the one place the plan trades away a safety net, so step 7 and step 9
   each carry an explicit manual side-by-side against the worktree instead.

4. **Every step ends with `npm run check` clean and one commit.** Terse commit
   subject, no essay — the reasoning lives here and in `spec.md`.

5. **Iterate on small data, verify on large.**
   - `data/explorertest.json` (the Playwright fixture, generated from
     `default.json`) — fast reload, and it is what the screenshots see.
   - `data/omf.json` — the `nestedCircles` smoke test. The only file that
     exercises varying circle depth per branch, which is what the level formula
     gets wrong if you get it wrong.
   - `data/openmrs.json` (34k nodes) — perf iteration.
   - `data/spring-projects.json` (80k nodes) — the acceptance target. Punishing to
     reload; use it at steps 7, 9 and 10 only.
   - `data/default.json` — the only one with coupling enabled; use it whenever
     touching the overlay.

6. **Unit tests cover pure modules only.** Vitest runs in jsdom, which has no
   WebGL context. So `triangulate.ts`, `colours.ts`, `picking.ts`, `camera.ts` and
   the level-assignment function must not import or reference `gl`. `GlRenderer.ts`
   and `shaders.ts` are deliberately untested by Vitest and are verified manually
   and by the screenshot suite. Keeping that line clean is a design constraint, not
   an accident — if something needs a test, it belongs on the pure side of it.

## Technical context the steps assume

- **The canvas must reproduce the SVG's `viewBox` fit exactly.** `svg.chart` is
  `width: 100%; height: 1024px` (`src/css/main_areas.scss`) with
  `viewBox = [-layout.width/2, -layout.height/2, layout.width, layout.height]` and
  the default `preserveAspectRatio="xMidYMid meet"`. So the world→CSS-pixel scale
  is `min(clientWidth / layout.width, clientHeight / layout.height)`, with the
  remainder split evenly as letterboxing on the other axis. Get this wrong by a
  hair and everything is subtly offset — and because the overlay still uses the
  real `viewBox`, the two layers will visibly drift apart when you pan. That
  drift is the best early test there is; step 1 exploits it deliberately.
- **The full transform chain** is: world → viewBox fit → `d3.zoom` transform →
  CSS pixels → (×DPR) device pixels. `d3.zoom` stays the single source of truth;
  its handler writes uniforms _and_ sets the overlay `<g>` transform.
- **Stroke widths are CSS pixels** and must be multiplied by DPR before reaching
  the shader (`spec.md`, "DPR and resize").
- **`tests/screenshots.spec.ts` reaches into the renderer.** `selectAFileNode`
  (L34) locates `svg.chart path.cell` and clicks the smallest-area cell until the
  inspector shows a file. Those elements cease to exist in step 4; the helper is
  reworked in step 5 to click canvas coordinates instead. Shot 7 is the only test
  that uses it.
- **`update()` currently re-sets `.attr("d", …)` on every path for a pure colour
  change** (`Viz.tsx` L55-57, L173-174). Steps 4–7 keep a deliberately naive
  "rebuild everything on any change" routing; step 8 is where the three update
  paths get separated and this inefficiency is actually fixed. Don't try to
  optimise it earlier — correctness first, and step 8 has the measurement.
- **`fillFn` returns `url(#patternN)` for `teamPattern` only.** Until step 9 that
  resolves to a flat fallback colour (step 3). `svgPatternDefs()` and the
  `<linearGradient>` defs stay in place, unused by the canvas, until step 9.
- **Level formulae** (`spec.md`, "Current architecture"), with the deliberate
  1-level offset between them:
  ```
  outlineLevel   = depth - (circleAncestors + 1)     // was redrawNesting
  selectionLevel = depth - circleAncestors           // stays SVG, unchanged
  ```
- `nodeCircleAncestors` throws rather than defaulting; `assertConvex` must do the
  same, for the same reason (CLAUDE.md).

## Risks to watch

| Risk                                                                                               | When it bites            | Mitigation                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright's Chromium has no GPU and may fall back to SwiftShader, or refuse a GL context entirely | step 0 / step 4          | Checked in step 0, before any code is written. If there is no context at all the whole screenshot suite dies and the plan needs rethinking, so find out first.    |
| SwiftShader antialiasing differs from the desktop GPU's                                            | step 11                  | Expected — `spec.md` already flags AA as making baselines less portable. Baselines are generated by the suite, so they will be SwiftShader's output consistently. |
| Outline buffer size at 80k nodes (~90 MB projected)                                                | step 7, measured step 10 | Measure before optimising. Packing fallback (Int16 normals, Uint8 level) is documented in `spec.md` and is a contained change to `geometry.ts` + `shaders.ts`.    |
| Quadtree picking inaccurate at clipped-cell edges                                                  | step 5                   | Open question 2 in `spec.md`. GPU picking is the documented fallback; decide by clicking around, not by theory.                                                   |
| Accessibility regression (canvas is opaque to screen readers)                                      | step 12                  | Out of scope per `spec.md`, but must be _recorded_ in CLAUDE.md, not quietly dropped.                                                                             |

---

## Steps

Each step: what it does, what it touches, and how it is verified. Automated checks
mean `npm run check` (typecheck + lint + format + vitest). Manual checks use the
`playwright-cli` skill, per CLAUDE.md — not a browser plugin.

### Step 0 — De-risk the environment, and build a reusable benchmark

No production code. Two unknowns that would invalidate large parts of the plan if
they went the wrong way, plus the measurement tool that steps 7 and 10 need.

- [x] Confirm Playwright's Chromium gives a working WebGL context: a throwaway
      `page.evaluate` that creates a canvas, gets `webgl`, and reports
      `UNMASKED_RENDERER_WEBGL`. Record whether it is GPU or SwiftShader.
- [x] Build a checked-in benchmark harness (`scripts/bench-render.ts` or similar,
      driven by Playwright) that loads a named data file, drives a synthetic
      pan+zoom across N frames, and reports mean `requestAnimationFrame` delta.
      The previous one was throwaway (`docs/rendering-performance.md`,
      "Reproducing it") — this time keep it, so the before and after numbers come
      from identical code.
- [x] Run it against the **current SVG renderer** on `openmrs.json` and
      `spring-projects.json`. These are the before numbers step 10 compares to.
      Expect roughly 2222 ms/frame on openmrs; if it differs wildly, work out why
      before continuing.
- [x] Set up the A/B worktree (decision 2 above).

**Verify:** the harness produces stable, repeatable numbers across two runs on the
same file. Numbers recorded in the step-10 section of this file as you go.

**Note:** if the WebGL context check fails in Playwright, stop and reconsider —
everything downstream assumes the screenshot suite can still see the rendering.

### Step 1 — Canvas scaffold: layers, camera, DPR, resize, zoom lock

The riskiest integration work, done while there is nothing else on screen to
confuse it.

- [x] `src/webgl/camera.ts`: pure module. `fitTransform(layout, clientW, clientH)`
      reproducing the `xMidYMid meet` viewBox fit; composition with the `d3.zoom`
      transform; `screenToWorld(clientX, clientY)`; the world→clip matrix or
      scale/translate uniforms. No `gl` import.
- [x] `src/Viz.tsx`: add `<canvas className="chart-gl">` **before** the existing
      svg, rename `svg.chart` → `svg.chart-overlay`. Both absolutely positioned
      and exactly co-located inside `.Viz`.
- [x] `src/css/main_areas.scss`: position the two layers. Overlay keeps normal
      pointer events **for now** (the `.nesting` click handler is still live until
      step 7; the switch to `pointer-events: none` happens in step 5).
- [x] Canvas sizing: `width/height = client × devicePixelRatio`, CSS size in layout
      pixels, `ResizeObserver` on the container re-sizing and redrawing without
      rebuilding geometry.
- [x] Zoom handler updates the camera uniforms _and_ the overlay `<g>` transform.
- [x] **Temporary debug draw:** a single quad (raw 2D canvas context is fine here,
      or the first scrap of GL) outlining the root node's polygon bounds.

**Verify — unit:** `camera.ts` tests — fit scale and centring for wider-than-tall
and taller-than-wide containers; `screenToWorld` round-trips against world→screen
at DPR 1 and 2, with and without a zoom transform.

**Verify — manual:** the debug quad must sit _exactly_ on the root cell's edge and
stay welded to it through pan, zoom, and a window resize. Any drift is a camera
bug, and this is by far the cheapest place to find it. Check on `omf.json` too —
its root is circle-packed.

**Done when:** the app is visually unchanged apart from the debug quad, and the
quad tracks the SVG perfectly.

### Step 2 — `triangulate.ts`: `fanTriangulate` + `assertConvex`

Pure, no GL, no app change.

- [x] `fanTriangulate(points)` → flat `Float32Array` of triangle vertices,
      `(n-2) × 3` vertices for an n-gon, winding preserved from input order.
- [x] `assertConvex(points, path)` — sign-consistency of the cross product across
      consecutive edge pairs. Throws with the node path in the message. Guarded to
      development builds (`import.meta.env.DEV`), per `spec.md`.

**Verify — unit:** vertex count for a triangle, quad and 12-gon; winding preserved;
degenerate input (<3 points) rejected explicitly rather than silently emitting
nothing; `assertConvex` accepts a real Voronoi cell lifted from `default.json` and
a circle approximation, and throws on a hand-built concave polygon and on a
collinear-points edge case.

**Done when:** tests pass, nothing else changed.

### Step 3 — `colours.ts`: CSS colour → RGB, memoised

- [x] `parseCssColour(css)` → `[r, g, b]` in 0–1, memoised in a `Map`. Build on
      `d3.color()` (already a dependency) rather than hand-rolling hex/rgb/named
      parsing. Throw on unparseable input — a silently-black cell is exactly the
      failure mode this repo avoids elsewhere.
- [x] `resolvePatternFallback(fill, state)` — recognises `url(#patternN)`, looks
      the id up in `state.calculated.svgPatterns`, and returns the **first** colour
      of the triple. This is the `teamPattern` flat fallback that stands until
      step 9. Everything else passes through untouched.

**Verify — unit:** 3- and 6-digit hex, `rgb()`, `rgba()`, named colours, and the
themed colours actually used in `state.ts` defaults; memoisation returns an equal
result on the second call; unparseable input throws; `url(#pattern3)` resolves to
the expected first colour and an unknown pattern id throws.

**Done when:** tests pass, nothing else changed.

### Step 4 — Fills on screen; delete the `.cell` layer

The cutover. This is the big one.

- [ ] `src/webgl/shaders.ts` — vertex/fragment source for flat-filled triangles.
- [ ] `src/webgl/geometry.ts` — `buildFills(nodes)` → positions `Float32Array` and
      a per-vertex colour array, using `fanTriangulate` and `assertConvex`. Same
      node filter as today (`Viz.tsx` L391-395): `depth <= expensiveConfig.depth`
      and (`children === undefined` || at the depth limit).
- [ ] `src/webgl/GlRenderer.ts` — context (`antialias: true`, standard alpha
      blending), program compilation with real error reporting on failure, static
      position buffer, separate dynamic colour buffer, uniforms, `draw()`,
      `destroy()`. Positions and colours in **separate buffers from the start** —
      step 8 depends on it and retrofitting is a rewrite.
- [ ] Wire into `Viz.tsx`; remove the temporary debug quad.
- [ ] **Delete** `redrawPolygons`, the `.cell` selection, its `click` handler and
      its `svg:title` children. Remove the `redrawPolygons` call from `update()`.
- [ ] Routing stays naive: _any_ config or expensiveConfig change rebuilds
      geometry and colours. Slow, correct, and fixed in step 8.

**Verify — manual (this is the step that needs eyes):** side by side with the
worktree at 5174, on `explorertest`, `omf` and `openmrs`:

- Fills match in colour and shape, cell for cell. Zoom into a dense area on both.
- Both themes; every visualisation in the dropdown (`teamPattern` will be flat —
  expected, that is the step-3 fallback).
- Pan/zoom is already visibly smooth. Not measured yet, just noted.
- The `.nesting` strokes still render, in SVG, on top. Missing hairlines where a
  cell's own `defaultStroke` used to be are expected until step 7.

**Verify — automated:** `npm run check`. `npm run e2e` **will** now fail shot 7
(`selectAFileNode` can no longer find `path.cell`) and diff on the visualisation
shots. Expected; do not re-baseline. Shot 7 is fixed in the next step.

**Known temporary regression:** clicking a cell interior no longer selects
anything (only the surviving `.nesting` strokes respond). Restored in step 5.

**Done when:** fills render through WebGL and no `.cell` path exists in the DOM.

### Step 5 — Picking and click-select

Closes the regression opened by step 4 immediately.

- [ ] `src/webgl/picking.ts` — `pointInConvexPolygon(polygon, x, y)` (sign
      consistency across edges); `buildIndex(nodes)` over `node.layout.center`
      using `d3.quadtree`; `pick(worldX, worldY)` — nearest centroid, then a
      widening search of ~16 nearest candidates, then `null` for a background
      click. Per `spec.md`; no `gl` import.
- [ ] `Viz.tsx`: canvas `click` → `screenToWorld` (step 1) → `pick` →
      `dispatch({ type: "selectNode", payload: node.data.path })`. Identical
      payload to today.
- [ ] Canvas takes pointer events; overlay becomes `pointer-events: none` with
      `.coupling` paths re-enabling their own. Note the `.nesting` layer loses its
      click handler here rather than in step 7 — directory-border clicks are
      dropped deliberately (`spec.md` decision 3).
- [ ] `tests/screenshots.spec.ts`: rework `selectAFileNode` to click canvas
      coordinates. The layout is deterministic (polygons come from the data file),
      so a fixed offset within `.Viz` works; keep the existing
      "retry until the inspector shows a file" loop as the safety net.

**Verify — unit:** `pointInConvexPolygon` against hand-built cases — inside,
outside, exactly on an edge, exactly on a vertex, and both winding orders.
`buildIndex`/`pick` on a small synthetic grid of cells, including a point in a cell
whose centroid is _not_ the nearest centroid (the case the widening search exists
for — construct it explicitly from a clipped cell).

**Verify — manual:** click 20-odd cells across `openmrs`, especially thin slivers
and cells at the outer clipped edge, and confirm the inspector shows the file you
actually clicked. This is where open question 2 gets answered. If it is
consistently wrong at clipped edges, switch to the GPU-picking fallback documented
in `spec.md` before moving on — do not carry a known-flaky pick forward.

**Verify — automated:** `npm run check`; shot 7 passes again (its baseline is the
Inspector panel, not the canvas, so it should match without re-baselining — if it
doesn't, the reworked helper is selecting a different node; make it select the same
one).

### Step 6 — HTML hover tooltip

- [ ] `src/VizTooltip.tsx` — a single positioned div.
- [ ] Hover handler on the canvas, throttled to one `pick` per
      `requestAnimationFrame`, updating only when the picked node changes; hides on
      mouse-out and on background.
- [ ] Text stays exactly `node.data.path`, matching today's `svg:title`, so
      screenshots stay comparable. Open question 3 (richer tooltip content) is
      deliberately **not** answered here.
- [ ] Style it to be visible in both themes.

**Verify — manual:** hover across dense and sparse areas of `openmrs`; the tooltip
appears immediately (no ~1 s native delay), tracks the cursor, shows the right
path, and disappears over background. Watch the frame time while sweeping the
mouse — if hover picking is visible in the frame rate, the rAF throttle is wrong.

**Verify — automated:** `npm run check`.

### Step 7 — Outlines; delete the `.nesting` layer

Visual parity is reached here. The largest single quality risk in the plan.

- [ ] `geometry.buildOutlines(nodes)` — for each edge, 4 vertices (`a_pos`,
      signed `a_normal`, `a_level`) and 6 indices. The outline set is the **union**
      of the cell set and the nesting set, **one outline per node** — this is what
      removes the 19,101 redundant paths.
- [ ] Level assignment as its own exported pure function:
      `level = depth - (circleAncestors + 1)`; `< 0` or `>= 4` → index 4
      (`defaultStroke`/`defaultWidth`); otherwise index `level`.
- [ ] **Preserve the depth-descending sort** when writing the index buffer, so
      shallower/wider outlines paint over deeper ones exactly as today.
- [ ] Vertex shader offsets by `a_normal * (u_widths[level] * 0.5 * u_dpr) / u_scale`
      — constant screen-space width, reproducing `non-scaling-stroke` at zero
      per-frame cost. Colour from `u_strokeColours[5]`.
- [ ] Draw order: all fills, then all outlines. No depth buffer.
- [ ] **Delete** `redrawNesting` and the `.nesting` selection, and its call in
      `update()`.
- [ ] Record the actual outline buffer size at openmrs scale and extrapolate
      (open question 1). Do not pre-emptively pack — measure first.

**Verify — unit:** level assignment against the formula for depth 0..8 with
`circleAncestors` 0, 1 and 2 — including the `omf.json` case where circle depth
varies per branch, which is the whole reason this is a per-node count. Edge
expansion maths: normal direction and magnitude for a known horizontal, vertical
and diagonal edge, and that the two triangles cover the quad.

**Verify — manual, side by side with the worktree — the parity check:**

- `explorertest`, `omf` (nested circles at varying depth — the acid test for the
  level formula), `openmrs`, and `default` (coupling on).
- Stroke colours and widths per nesting level, in both themes.
- Widths stay constant on screen through a full zoom range (0.5× to 16×).
- Retina: strokes are the same visual weight as the SVG version, not half.
- Hairline differences on shared borders are **expected** (`spec.md`, stroke
  overpaint order). Anything structural — a whole nesting level missing, wrong
  level on a nested repo, widths scaling with zoom — is a bug.
- [ ] **Smoke perf check** on `spring-projects.json`: it should already feel
      smooth. Note the geometry build time from the console. Full measurement is
      step 10, but finding out here that 80k nodes takes 10 s to build is much
      better than finding out at step 10.

**Done when:** the WebGL rendering is a faithful reproduction of the SVG one, and
`Viz.tsx` contains no polygon-drawing code at all.

### Step 8 — The three update paths

The design's core, and the fix for the "re-sets `d` on every path for a colour
change" inefficiency. Split the naive routing from step 4.

- [ ] `GlRenderer` exposes three distinct methods, not one `render()`:
      `setTransform()` (uniforms only), `setColours(fillFn)` (colour buffer only —
      positions untouched), `setGeometry(nodes)` (re-triangulate, reallocate both
      buffers, rebuild the picking index).
- [ ] `setGeometry` **reallocates** rather than patching in place — a future
      re-layout can change a polygon's vertex count.
- [ ] Nesting colours and widths become **uniform updates with no buffer upload
      at all**, since level is a per-vertex attribute.
- [ ] Route the existing `useEffect` (`Viz.tsx` L647-693) branches to the matching
      method, keeping its `_.isEqual` shape: `expensiveConfig` → `setGeometry`;
      `config` → `setColours` (or uniforms only for nesting colours/widths);
      zoom → `setTransform`.
- [ ] `destroy()` called on unmount; buffers and program released.

**Verify — manual, with `console.time` on each path, on `spring-projects.json`:**

- Visualisation switch (LOC → churn → team): **< 50 ms**, and the console must
  show _no_ geometry rebuild.
- Dragging a nesting colour picker or width slider: uniform-only, no upload,
  immediate.
- Date-range brush and theme switch: colour path only.
- Depth change: geometry path, 100–500 ms, and picking still works afterwards
  (the index must have been rebuilt — click a cell that only exists at the new
  depth).
- Pan/zoom while each of the above is settling: no flicker, no stale transform.

**Verify — automated:** `npm run check`.

### Step 9 — Team pattern stripe shader

Sequenced last of the rendering work, exactly as `spec.md` says: everything else
is independent of it.

- [ ] Palette texture: `N × 1` RGB, 3 texels per pattern, built from
      `state.calculated.svgPatterns`. `SVG_PARTITIONS`, `topTeamsPartitioned` and
      `coloursToColourKey` are **unchanged** — only the rendering moves.
- [ ] Per-vertex `a_patternIndex`, used only when `u_patternMode` is set;
      `v_world` passed as a varying.
- [ ] Fragment shader per `spec.md` — phase anchored to **world** space, period
      fixed in **screen** space via `u_scale`. Do **not** use `gl_FragCoord`
      directly; that gives the shower-door artefact.
- [ ] Remove the step-3 flat fallback path for `teamPattern`.
- [ ] **Delete** `svgPatternDefs()` and the `<linearGradient>` defs from
      `Viz.tsx`, and the `teamPattern` branch that renders them.
- [ ] Tune the stripe period (open question 4): 10 CSS px was chosen against a
      world-space pattern. Try 8/10/14 and pick by eye — it is one uniform.

**Verify — manual, side by side with the worktree:**

- Stripes align across adjacent cells — the continuous-fabric character must
  survive. Zoom to a boundary between two same-team cells and confirm the pattern
  runs through unbroken.
- **Pan** and confirm the pattern travels _with_ the content. If it slides
  underneath, the phase is anchored to the viewport and the shader is wrong.
- Stripe width is constant on screen across the zoom range — this is the
  deliberate change from today, and a known screenshot delta.
- Solid-colour patterns (all three colours equal) render solid, matching the
  simplified-gradient branch that exists today.
- Proportions look right: a 70/30 team split should read 2:1.
- Record the small-cell limitation if it looks misleading in practice
  (`spec.md` says revisit only if it does).

**Verify — automated:** `npm run check`.

### Step 10 — Perf verification and doc update

- [ ] Run the step-0 harness against the new renderer on `openmrs.json` and
      `spring-projects.json`, same machine, same conditions as the before numbers.
- [ ] Record: mean ms/frame pan and zoom; one-time geometry build time; buffer
      sizes (fills and outlines separately); visualisation-switch time.
- [ ] Check against `spec.md`'s success criteria: ≤ 16.7 ms/frame on
      spring-projects; geometry build under ~1 s at 80k; viz switch < 50 ms.
- [ ] Answer open question 1 with a real number. If the outline buffer is
      uncomfortable, apply the documented packing (Int16 normals, Uint8 level)
      **now**, and re-measure — not as a follow-up.
- [ ] Update `docs/rendering-performance.md` with an "after" section: the new
      numbers beside the old table, and a pointer to the checked-in harness.

**Verify:** two runs agree; the numbers meet the criteria, or the shortfall is
written down explicitly rather than rounded away.

### Step 11 — Screenshot review and the single deliberate re-baseline

The one place the frozen baselines get spent. Take it seriously.

- [ ] `npm run e2e`. Open **every** reported diff image.
- [ ] For each, write down which entry in `spec.md`'s "Expected visual deltas" it
      corresponds to: stroke overpaint order, stripe width, or antialiasing.
- [ ] Anything that cannot be attributed to that list is a **bug**. Fix it and
      re-run before re-baselining. Per CLAUDE.md, a diff on the visualisation
      canvas is normally a real bug — this is the exception, and it only holds for
      deltas on that list.
- [ ] Confirm shots 8 and 9 (control panels, no canvas) are **pixel-identical**.
      A diff there means something leaked out of the renderer.
- [ ] `npm run e2e:update`, once. Commit the baselines in their own commit with
      the attribution list in the message — this is the one commit body worth more
      than a line.

### Step 12 — Fold back, clean up, release notes

- [ ] Fold the durable parts into `CLAUDE.md`: the `src/webgl/` module layout and
      what each file owns; the three update paths and why the buffers are split;
      the camera/viewBox-fit constraint; picking returns leaves only (and why
      directory-border clicks are gone); the pure-vs-GL test boundary; the stripe
      shader's world-phase/screen-period rule and the `gl_FragCoord` trap.
- [ ] Record the **accessibility regression** explicitly (canvas is opaque to
      screen readers where SVG paths were DOM nodes) — `spec.md` says record it,
      not hide it.
- [ ] Add any surviving open questions to CLAUDE.md's "Known follow-ups".
- [ ] `CHANGELOG.md` entry; version bump if releasing.
- [ ] `git worktree remove ../explorer-svg`.
- [ ] Delete `spec.md` and `plan.md`. Git keeps the history.

---

## Progress notes

Append findings here as steps complete — measured numbers, decisions taken on the
open questions, anything that contradicts the spec. Fold the durable parts into
`CLAUDE.md` at step 12.

### Step 0

- **GPU fix, needed again at steps 4/7/10:** headless Playwright Chromium on
  this Mac defaults to software SwiftShader even though a real GPU (Intel UHD
  630 - the chip spec.md's numbers were measured on) is present and used
  automatically in headed mode. `chromium.launch({ args: ["--use-angle=metal"] })`
  restores it in headless mode too. Baked into `scripts/bench-render.ts` as
  `GPU_ARGS` (Darwin only) - without it, every later benchmark and screenshot
  run would silently measure SwiftShader instead.
- **Benchmark harness:** `scripts/bench-render.ts` - `npm run bench:webgl-check`,
  `npm run bench -- <dataFile> [--steps] [--warmup] [--port] [--headed]`. Spawns
  its own `vite` server per data file (the data file is baked in via
  `__EXPLORER_DATA__` at server-start time, not a query param),
  then drives 30-40 synthetic zoom-wheel events in-page (`dispatchEvent`, not
  Playwright's out-of-process mouse API - that adds IPC latency that would
  swamp a 16ms/frame measurement) and reports mean/median/min/max frame time.
  Wheel-only (no simulated drag): d3-zoom's wheel handler already changes
  translate as well as scale, exercising the same transform-write a drag does.
- **SVG baselines for step 10 to compare against:** openmrs ~572-577 ms/frame
  mean (repeatable within ~1%), spring-projects ~1894 ms/frame mean - both
  headless, GPU fixed. Both are ~4x lower than spec.md's 2222ms figure for the
  same openmrs case, most likely because this harness's small wheel-driven
  zoom deltas expose less new area per frame than the original sweeping
  drag gesture did; not chased further since openmrs->spring-projects scaling
  (~3.3x, close to the ~3.6x node-count ratio) confirms the harness itself is
  sound, and the qualitative finding (hundreds of ms vs. a 16.7ms target) is
  unaffected either way. If step 10's WebGL number comes back suspiciously low
  (sub-1ms, suggesting wheel deltas are being clamped against `scaleExtent`),
  revisit the gesture size then.
- **A/B worktree** at `../explorer-svg` (i.e.
  `/Users/korny/Dropbox/prj/dev/polyglot/explorer-svg`), checked out at `fd71cf6`
  (detached HEAD), `node_modules` dropbox-ignored before `npm install`. Not
  currently running - start with `cd ../explorer-svg && npx vite --port 5174`
  whenever a side-by-side is actually needed (step 4 onward).

### Step 1

- **`d3.zoom` is attached to a new `.chart-stack` wrapper div, not to either
  layer** - this changed spec.md's "Target architecture" section (now the
  source of truth for the design and why); don't re-derive it here.
- Verified pixel-precisely, not just by eye: read the debug canvas back via
  `getImageData` and checked against hand-computed expectations from the
  layout data (fit scale/centring, and the zoom transform's `k`/`x`/`y` after a
  known wheel delta) - matched to the pixel. Confirmed on both `explorertest`
  (circlePack root) and `omf.json` (nestedCircles, varying circle depth per
  branch), through pan, zoom, and window resize, with no drift between the
  canvas and the SVG overlay.
- **Gotcha for future manual playwright-cli checks on this app:** a mouse
  target computed from a `getBoundingClientRect()` that's taller than the
  actual viewport silently fails - `elementFromPoint` returns `null`, the
  event falls through to native page scroll, and a `scrollY` change is easy to
  mistake for a working pan/zoom. Resize the viewport to comfortably contain
  the chart area (1024px tall) before trusting any pan/zoom measurement.
- No visual regression: SVG cell/nesting/selection rendering is byte-for-byte
  the same code path as before, just inside a renamed `svg.chart-overlay`
  sitting over the new (otherwise-empty-but-for-the-debug-quad) canvas.

### Step 2

- **`assertConvex` self-guards on `import.meta.env.DEV`** rather than making
  every call site check it - one `if` at the top, callers always call it
  unconditionally. `import.meta.env.DEV` is `true` under Vitest, so the dev
  behaviour is exactly what the tests exercise.
- **Collinear consecutive points are tolerated, not thrown on** - a zero cross
  product is treated as inconclusive rather than a sign mismatch. Deliberate:
  the current Voronoi layout algorithm can produce a collinear vertex on an
  otherwise-valid cell, and that's bad input in the data file that can't be
  hand-fixed, so `assertConvex` must not block on it. Only a genuine sign
  flip (an actual concave turn) throws.
- Test fixture uses a real 15-point Voronoi cell lifted from
  `data/default.json` (`package.json`'s node) for the "accepts real data"
  case, and a generated regular polygon for the circle-approximation and
  12-gon cases - no need to embed a real 128-point circlePack polygon.
- **User correction after the first pass:** `assertConvex` was written to
  throw on a collinear vertex, matching a literal reading of the plan's
  verification bullet. Corrected to tolerate it (skip, don't flag as a sign
  mismatch) — the current Voronoi layout algorithm can produce a collinear
  vertex on an otherwise-valid cell, and that's bad input in the data file,
  not something fixable by hand. Only a genuine concave turn throws.

### Step 3

- `resolvePatternFallback`'s second parameter is narrower than the plan
  text's literal `(fill, state)`: it takes
  `svgPatternIds: ReadonlyMap<ColourKey, PatternId>` (i.e.
  `state.calculated.svgPatterns.svgPatternIds`) rather than the whole `State`
  object, since that's the only piece it needs and it keeps the module
  trivially testable without constructing a full `State`. Step 4's call site
  passes `state.calculated.svgPatterns.svgPatternIds`.
- Reverse (`PatternId` -> first colour) lookup is built once per distinct
  `svgPatternIds` Map and cached by object identity in a `WeakMap`, rather
  than linear-scanning `svgPatternIds` on every call — this runs once per
  node during a colour-buffer rebuild (spec.md's "three update paths"), so an
  O(n) scan per call would be O(n\*m) across a whole tree. Same memoisation
  spirit as `parseCssColour`'s cache, just keyed on object identity instead
  of the string value.
- `parseCssColour` built on `d3.color()` per spec.md, following the existing
  `import * as d3 from "d3"` convention (`Viz.tsx`, `state.ts` already do
  this) rather than a named import.
