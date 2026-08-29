# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Where context lives

Project context belongs in git so it can be read and reviewed — never in Claude's private memory.

- **`CLAUDE.md`** (this file) — durable project context. Keep it thin: design decisions and
  constraints that aren't obvious from the code, plus where to find things that don't follow
  common conventions. Not a substitute for reading the code.
- For a substantial piece of work, add a **`spec.md`** (what and why, edited in place as it
  stands _now_) and **`plan.md`** (ordered steps and checklist). Fold anything durable back into
  this file when the work lands, then delete them — git keeps the history.

## What this is

The front-end (Vite + TypeScript + D3) for visualising a codebase as a Voronoi/circle-pack treemap, coloured by metrics like lines of code, age, churn, indentation, or git team ownership. It only _renders_ data — the JSON data files it consumes are produced by a separate scanner tool (not in this repo); see <https://polyglot.korny.info>. The JSON data format is versioned (`SUPPORTED_FILE_VERSION` in `src/polyglot_data.types.ts`) and changes with the app, so old data files can stop working - changes to the scanner need to be in sync with changes to this front-end.

The version check at `Loader.tsx` is `semver.satisfies(data.version, SUPPORTED_FILE_VERSION)` with a bare version as the range, which means **exact equality**, not "compatible with". A data file one patch version behind will not load. Only `data/default.json` is tracked in git; the other local files there are untracked, mostly stale, and will not load without a version bump.

## Commands

- `npm install` — install dependencies
- `npm start` (alias `npm run dev`) — run dev server at localhost:5173, loads `data/default.json`
- `EXPLORER_DATA=foo npm start` — load `data/foo.json` instead (and optionally `data/foo_state.json` for saved UI state)
- `npm run build` — production build to `dist/`, containing the app plus exactly the one data file named by `EXPLORER_DATA` (or `default.json` if unset)
- `npm test` / `npm run test:watch` — Vitest unit tests
- `npm run e2e` / `npm run e2e:update` — Playwright screenshot suite (10 baseline shots under `tests/screenshots.spec.ts-snapshots/`)
- `npm run typecheck` / `npm run lint` / `npm run format:check` — individual checks; `npm run check` runs all of them plus the unit tests
- Release process: bump `package.json` version, update `CHANGELOG.md`, tag `vX.Y.Z`, push tags. No CI and no build artifacts — users build from source (see `README.md`).

The screenshot suite is a **review aid, not a pass/fail gate**: its job is to make visual change
_visible_ so it's a deliberate choice. Open any reported diff and decide, then re-baseline with
`npm run e2e:update`. Don't wire it into a blocking check. Strictness is asymmetric though — a
change that touches no UI code should produce **zero** diffs, and any diff on the visualisation
canvas is a real bug, because those polygons are pre-computed in the data file rather than laid
out at render time.

## Manual visual verification

For manual checks that need eyes on the rendered app (comparing a before/after, confirming a
change in the real app), use the `playwright-cli` skill to drive a real browser and take
screenshots. Don't use a browser extension/plugin (e.g. claude-in-chrome) for this — Korny prefers
playwright-cli.

## Architecture

### Data flow: Loader → preprocess → App state → Visualizations

1. **`Loader.tsx`** fetches the raw JSON data file (`PolyglotData`, shape defined in `polyglot_data.types.ts`) and an optional saved-state file (`*_state.json`), checks the data file's semver against `SUPPORTED_FILE_VERSION`, then runs it through `preprocess.ts` (`linkParents`, `countLanguagesIn`, `gatherGlobalStats`, `gatherNodesByPath`, `gatherTimescaleData`, `postprocessUsers`) to build `VizMetadata`. Only once this is done does it render `App`.
2. **`App.tsx`** owns the single `useReducer` global state (`state.ts`), optionally hydrated from an imported/saved state file via `exportImport.ts`, and renders `Viz`, `Controller`, and `Inspector` side by side against the same `dataRef`/`state`/`dispatch`.
3. **`state.ts`** is the core of the app: one big `State` object (`config`, `couplingConfig`, `expensiveConfig`, `calculated`, `messages`) manipulated by a single `Action` union and `updateStateFromAction` reducer (Redux-style, exhaustive switch with a `never` check at the bottom so unhandled actions are a compile error). Every dispatch also runs through `postprocessState`, which recomputes derived (`calculated`) data — user→team lookups, file maxima, SVG stripe patterns — only when the relevant inputs actually changed (diffed with lodash `_.isEqual`), or unconditionally when `calculated.forceRecalculateAll` is set. This recompute-on-diff pattern is deliberate for performance on large trees; preserve it rather than recomputing eagerly.
4. **`VisualizationData.tsx`** is the registry of all visualisations (`Visualizations` map), including "parent" visualisations with sub-children (e.g. Indentation → sum/p99/stddev, Churn → days/commits/lines). Each entry knows its display order, help text, an optional `featureCheck` against the data file's `FeatureFlags` (git/coupling/git_details/file_stats — used to hide visualisations the loaded data can't support), and a `buildVisualization` factory.
5. **`src/visualizations/*.tsx`** implement `BaseVisualization<ScaleUnit>` (`BaseVisualization.tsx`): each provides `dataFn`/`parentFn` (extract a value from a file/directory node) and a `scale` (value → colour), and the base class handles the shared `fillFn` logic (neutral colour for undefined values, overrides for circle-pack backgrounds and not-yet-created files given the current date range).
6. **`Viz.tsx`** does the actual D3 rendering (Voronoi treemap / circle pack) against the `HierarchyNode<TreeNode>` tree, calling into the active visualisation's `fillFn`.
7. **`Controller.tsx`** / **`VisControlPanel.tsx`** / **`ColoursAndLinesControls.tsx`** hold the UI controls that dispatch `Action`s. **`inspectors/*`** render details about the currently selected node/path/team.

### Tree data model

`polyglot_data.types.ts` defines the JSON shape: a `TreeNode` is either a `DirectoryNode` or `FileNode` (discriminated via `isDirectory`/`isFile` by presence of `children`), each carrying optional `git`, `file_stats`, `coupling`, `indentation`, `loc` data depending on which `FeatureFlags` were enabled when the data was scanned. `parent` links are absent from the raw JSON and populated by `preprocess.linkParents` after load. Always check the relevant `FeatureFlags` (or use `assertFlag`) before assuming git/coupling/file_stats data is present — it may be legitimately absent for a given data file.

### Circle-packed layouts and `circleAncestors`

Node layout is baked into the data file by the separate layout tool
(`polyglot-code-offline-layout`), never chosen in the UI. `NodeLayout.algorithm` has three values,
and **`circlePack` and `nestedCircles` are two different modes, not a rename**:

- `voronoi` — the default.
- `circlePack` — circles at the top level only, voronoi below.
- `nestedCircles` — circle-packing recurses through nested repos until it hits a git repo root,
  then that subtree switches to voronoi. **Circle depth therefore varies per branch** within one
  tree, because repos sit at different depths.

That last point is why depth handling is a per-node count rather than a global flag.
`preprocess.linkParents` computes `circleAncestors` on every node — the number of _strict_
ancestors whose algorithm is a circle type (`isCirclePacked`) — and `Viz.tsx` reads it via
`nodeCircleAncestors` at four sites to offset `d.depth`. Nesting strokes sit one level deeper than
selection strokes; that 1-level difference is deliberate, so keep the relationship if you touch
those offsets. Compute this in preprocess, not per-node-per-redraw — `Viz` redraws are
performance-sensitive.

`nodeCircleAncestors` throws rather than defaulting when the field is missing, because 0 is
exactly the old buggy value and would show up as subtly-wrong nesting instead of a failure.

### WebGL rendering (`src/webgl/`)

`Viz.tsx` renders through raw WebGL 1, not SVG — SVG raster cost made pan/zoom
unusable above a few thousand nodes (2222 ms/frame on a 34k-node file); WebGL is
vsync-capped at ~16.7 ms/frame on an 80k-node file. Only selection outlines,
coupling arcs, and the timescale brush are still SVG, in a transparent
`pointer-events: none` overlay on top of the canvas. Full investigation and
numbers: `docs/rendering-performance.md`.

- `camera.ts` — pure, unit-tested, no `gl` import. `fitTransform()` reproduces
  the old `viewBox`'s `xMidYMid meet` fit; `screenToWorld()`/`worldToClipTransform()`
  compose that fit with the live `d3.zoom` transform. `d3.zoom` is attached to a
  plain wrapper `div` (`.chart-stack`), not to either the canvas or the overlay
  SVG — attaching to an SVG element makes `d3.pointer()` resolve through that
  element's own `viewBox`, which double-applies the fit. `overlayGroupTransform()`
  pre-compensates the overlay `<g>`'s transform for the fact that its SVG also has
  a `viewBox`, so the browser doesn't apply the fit twice.
- `GlRenderer.ts` — the only stateful object: GL context, two programs (fill,
  outline), their buffers, `draw()`, `pick()`, `destroy()`. Requires
  `OES_element_index_uint` (WebGL1's native index type is `UNSIGNED_SHORT`, too
  small for these buffers) and throws in the constructor if it's unavailable.
  Exposes three update methods instead of one `render()` — see below. It holds no
  recovery logic of its own: a lost GL context is handled in `Viz.tsx`, which
  drops the renderer on `webglcontextrestored` and rebuilds from scratch via the
  `redrawAllRef` thunk the main effect keeps current.
- `geometry.ts` — `buildFills()`/`buildOutlines()`: tree nodes → typed arrays.
  Polygons are convex (Voronoi cells, circle approximations), so
  `triangulate.ts`'s `fanTriangulate()` is an exact triangulation, no earcut
  needed; `assertConvex()` (dev builds only) throws on a genuine concave turn but
  tolerates a collinear vertex, which the layout tool can legitimately produce.
  Outlines are one GPU quad per edge (`gl.LINES` with width>1 is unreliable across
  drivers), offset in the vertex shader so width stays constant in screen space —
  this reproduces `vector-effect: non-scaling-stroke` at zero per-frame cost.
  `outlineLevel()` is the exported, unit-tested nesting-level formula.
  `NESTED_LEVEL_COUNT`/`OUTLINE_LEVEL_COUNT` are defined here and used everywhere
  else — including interpolated into `shaders.ts`'s fixed-size GLSL uniform array
  declarations, since GLSL array sizes must be compile-time constants. Don't
  restate either as a literal.
- `picking.ts` — `d3-quadtree` over cell centroids (`node.layout.center`); nearest
  centroid, then a widening search over ~16 candidates, then
  `pointInConvexPolygon()`. **Picking returns the leaf node under the cursor,
  always** — directory-border clicks used to select the directory, but that was
  emergent from SVG paint order (`.nesting` was `fill:none`, painted after
  `.cell`), not a designed behaviour, and is dropped. Directories are still
  reachable via the Inspector breadcrumb and the depth control.
- `colours.ts` — `parseCssColour()` (memoised, throws on unparseable input —
  matches this repo's no-silent-defaults convention). The `teamPattern`
  visualisation's `url(#patternN)` fills render through a palette texture
  (`buildPatternPalette()`/`parsePatternId()`), not flat colours — see below.
- `shaders.ts` — vertex/fragment source as template strings.

**The three update paths** (`GlRenderer.setTransform()` / `setColours()` /
`setGeometry()`) are the reason positions and colours live in separate buffers.
Pan/zoom writes only uniforms; switching visualisation rewrites only the colour
buffer; only a depth (`expensiveConfig`) change re-triangulates and reallocates
both buffers plus the picking index. `vizUpdatePaths.ts`'s `isNestingOnlyChange()`
detects the finest-grained case exactly (not heuristically): `state.ts`'s
`setLines` action is the only one that ever touches nesting colours/widths and
touches nothing else, so "nesting fields differ, nothing else does" routes
straight to a uniform-only `setNestingStyle()` update with no buffer touched at
all. Node lists are cached per-`draw()` in `Viz.tsx`'s `VizRefs` as
`visibleNodes` (the fill/cell set, also what the picking index is built from) and
`outlineNodes` (a strict superset — outlines are one per node, unioning what used
to be two overlapping SVG layers). `setColours()` throws if handed a `visibleNodes`
that doesn't match the geometry currently uploaded.

`src/vizUpdatePaths.ts` is where `State` meets the renderer: it builds the fill
function, pattern palette and nesting style the three update paths take, and
decides which path a config change needs. It lives outside `src/webgl/` so those
modules stay decoupled from the `State` type — keep that direction, and keep the
module pure, since it's the one part of the update routing that unit tests can
reach (`Viz.tsx` itself is imperative D3 throughout).

**Team pattern stripes** (`TeamPatternVisualization`) render through a fragment
shader, not the old SVG `<linearGradient>`. The phase is anchored to **world**
space (`v_world`, a varying) and the period is fixed in **screen** space via
`u_scale` — using `gl_FragCoord` directly locks the stripes to the viewport, so
panning slides the pattern under the content (the "shower door" artefact). This
is the one place `a_patternIndex` doubles as its own mode switch (`-1` = flat
colour, `>=0` = a pattern id), because a single visualisation legitimately mixes
patterned and flat vertices (`neutralColour`/`circlePackBackground` overrides in
`BaseVisualization.fillFn` stay flat even when `teamPattern` is active).

**Test boundary:** Vitest runs in jsdom, which has no WebGL context, so
`camera.ts`, `triangulate.ts`, `colours.ts`, `picking.ts`, and `geometry.ts`'s
pure functions are unit-tested and must never import `gl`. `GlRenderer.ts` and
`shaders.ts` are verified manually and by the screenshot suite only — keep that
line clean rather than reaching for a WebGL mock.

**Known regression:** the canvas is opaque to screen readers, where the old SVG
`.cell`/`.nesting` paths were (unlabelled, but still) DOM nodes. Not fixed — see
"Known follow-ups".

### State import/export

`exportImport.ts` + `SaveLoadControls.tsx` let users save/load the `State` (config, teams/aliases, colours, etc., but not `calculated`) as JSON, independent of the underlying data file — this is how `*_state.json` sidecar files work.

### Serving the data files

Data lives in top-level `data/`, which is deliberately **not** `publicDir` — scanner files run to
hundreds of MB and must never enter Vite's transform pipeline. Two small plugins in
`vite.config.ts` handle it instead: `serveDataDir` streams the directory off disk in dev,
`copyDataFile` emits exactly the one selected file at build time. Both carry comments on their
sharp edges; read them before changing either.

## Things that will bite you

- **`index.tsx` deliberately omits `React.StrictMode`**, and `react-hooks/refs` is off in
  `eslint.config.ts`. Both for the same reason: this app reads refs during render and does
  imperative D3 rendering in `Viz.tsx`, which StrictMode's double-invoked effects would break.
- **TypeScript is pinned to 6.x, not 7**, because `typescript-eslint` peer-caps at
  `typescript <6.1.0`. Check that cap before bumping.
- **`publish_*.sh` and `statefiles/` are gitignored on purpose** — they reference internal bucket
  names and have never been tracked. Don't "helpfully" commit them.
- **The Playwright fixture is generated, not committed.** `tests/global-setup.ts` copies
  `data/default.json` → `data/explorertest.json` at run start and drops the committed state
  sidecar beside it, so the fixture tracks the shipped default instead of duplicating 746 KB.
- **The screenshot suite's 2% tolerance (`maxDiffPixelRatio` in `playwright.config.ts`) can
  make `npm run e2e` pass clean while the actual pixels differ.** A real re-baseline (not just
  "does it currently pass") needs checking at `maxDiffPixelRatio: 0` first, or
  `npm run e2e:update` will silently leave a stale-but-still-passing baseline in place instead
  of updating it — confirmed doing exactly this during the WebGL rewrite's re-baseline.
- **`tests/screenshots.spec.ts`'s `selectAFileNode` clicks canvas coordinates, not a DOM
  element.** Since the WebGL rewrite there's no per-cell DOM node to target; it raster-scans a
  grid of canvas points and clicks the first one that resolves to a file. Which file that is
  can change if anything shifts the layout or the grid — it's deterministic given a fixed
  layout, not fixed in identity.

## TypeScript conventions specific to this repo

`tsconfig.app.json` enables `noUncheckedIndexedAccess`, which TypeScript doesn't fully reconcile with manual bounds-checks. The established convention (see `README.md`) is:

- Use non-null assertion (`!`) when an index is provably in range from a preceding check — `@typescript-eslint/no-non-null-assertion` is deliberately disabled for this reason.
- Where the index _isn't_ provably safe, throw an explicit `Error` on `undefined` rather than silently coercing, e.g. `if (colour == undefined) throw new Error("Logic error: invalid colour index")`.

Import ordering is enforced by `simple-import-sort` via eslint (not manually maintained).

## Known follow-ups

Deliberately not done; all still open:

- **Accessibility regression from the WebGL rewrite.** The canvas is opaque to screen readers;
  the old SVG `.cell`/`.nesting` paths were DOM nodes (unlabelled, so not genuinely navigable
  either, but present). Recorded rather than fixed — out of scope for that rewrite, revisit if
  accessibility becomes a priority.
- **Visualisation-switch time (a pure `setColours()` buffer update) misses its own <50 ms
  target** on `spring-projects.json` (80,691 nodes): ~83-244 ms depending on the visualisation,
  measured with the per-visualisation cost dominated by `geometry.ts`'s `buildFillAttributes`
  evaluating `fillFn` per node. Not investigated further; a candidate fix is memoising by
  distinct value rather than per node, since many nodes share a colour. See
  `docs/rendering-performance.md`'s "After" section for the measurement.
- **Tooltip shows only the file path**, matching the old `svg:title` for screenshot parity. Now
  that hover is cheap (WebGL picking, no native tooltip delay), it could show more (LOC, age,
  churn) — deliberately deferred, not attempted.
- **Regenerate `data/default.json` with the current scanner** — a `nestedCircles` root with
  coupling enabled and real git history. The tracked file is a hand-bumped 1.0.4-shaped one, and
  `nestedCircles` is the awkward layout, so the shipped default should eventually exercise it.
- **Re-verify against real scanner-generated multi-repo output** once
  `polyglot-code-offline-layout`'s `nested-circles` branch lands. The nested groups in the local
  `omf.json` smoke-test file were hand-built to match what `packChildren` produces; a real scan is
  the final word.
- **Consolidate the four `publish_*.sh` scripts.**
- **TypeScript 7** once `typescript-eslint` lifts its peer cap.
- **Better test coverage.** `datetimes.ts` and the week-bucketing in `preprocess.ts` are pure and
  currently covered only by the screenshot suite; `state.ts`'s no-git-dates branch calls
  `new Date()` directly, so it isn't testable as written. Korny is aware and content with this for
  now — don't add tests unasked.
