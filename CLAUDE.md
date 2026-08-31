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
- `npm run e2e` / `npm run e2e:update` — Playwright screenshot suite (see below)
- `npm run e2e:strict` — the same suite with the screenshot tolerance dropped to zero
- `npm run typecheck` / `npm run lint` / `npm run format:check` — individual checks; `npm run check` runs all of them plus the unit tests
- Release process: bump `package.json` version, update `CHANGELOG.md`, tag `vX.Y.Z`, push tags. No CI and no build artifacts — users build from source (see `README.md`).

The screenshot suite is a **review aid, not a pass/fail gate**: its job is to make visual change
_visible_ so it's a deliberate choice. Open any reported diff and decide, then re-baseline with
`npm run e2e:update`. Don't wire it into a blocking check. Strictness is asymmetric though — a
change that touches no UI code should produce **zero** diffs, and any diff on the visualisation
canvas is a real bug, because those polygons are pre-computed in the data file rather than laid
out at render time.

It runs as **two Playwright projects against two dev servers**, because the data file is baked in
at build time (`__EXPLORER_DATA__`) and so cannot be switched at runtime:

| project           | port | data                                   | spec                         | shots |
| ----------------- | ---- | -------------------------------------- | ---------------------------- | ----- |
| `chromium`        | 5173 | `default.json` — a `circlePack` root   | `screenshots.spec.ts`        | 10    |
| `chromium-nested` | 5174 | `nested.json` — a `nestedCircles` root | `nested-screenshots.spec.ts` | 6     |

`tests/helpers.ts` holds the interactions both share. The nested shots exist because
`circlePack` puts circles at the top level only, so the core 10 never render recursive circle
packing, varying circle depth, or the level-0-is-every-circle rule that `outlineLevel` implements
— including the regression where a circle full of packed circles vanishes entirely if it is
dropped from the outline set. Each nested shot is aimed at one specific behaviour; read the
comment above it before changing or removing it.

Both projects' `testMatch` patterns are anchored (`/[\\/]screenshots\.spec\.ts$/`) — unanchored,
the core project's pattern also matches `nested-screenshots.spec.ts` and it runs both specs
against the wrong data file.

## Manual visual verification

For manual checks that need eyes on the rendered app (comparing a before/after, confirming a
change in the real app), use the `playwright-cli` skill to drive a real browser and take
screenshots. Don't use a browser extension/plugin (e.g. claude-in-chrome) for this — Korny prefers
playwright-cli.

## Architecture

### Data flow: Loader → preprocess → App state → Visualizations

1. **`Loader.tsx`** fetches the raw JSON data file (`PolyglotData`, shape defined in `polyglot_data.types.ts`) and an optional saved-state file (`*_state.json`), checks the data file's semver against `SUPPORTED_FILE_VERSION`, then runs it through `preprocess.ts` (`linkParents`, `countLanguagesIn`, `gatherGlobalStats`, `gatherNodesByPath`, `gatherTimescaleData`, `postprocessUsers`) to build `VizMetadata`. Only once this is done does it render `App`.
2. **`App.tsx`** owns the single `useReducer` global state (`src/state/`), optionally hydrated from an imported/saved state file via `exportImport.ts`, and renders `Viz`, `Controller`, and `Inspector` side by side against the same `dataRef`/`state`/`dispatch`.
3. **`src/state/`** is the core of the app: one big `State` object (`config`, `couplingConfig`, `expensiveConfig`, `calculated`, `messages`) manipulated by a single `Action` union and `updateStateFromAction` reducer (Redux-style, exhaustive switch with a `never` check at the bottom so unhandled actions are a compile error). Every dispatch also runs through `postprocessState`, which recomputes derived (`calculated`) data — user→team lookups, file maxima, SVG stripe patterns — only when the relevant inputs actually changed (diffed with lodash `_.isEqual`), or unconditionally when `calculated.forceRecalculateAll` is set. This recompute-on-diff pattern is deliberate for performance on large trees; preserve it rather than recomputing eagerly.
4. **`VisualizationData.tsx`** is the registry of all visualisations (`Visualizations` map), including "parent" visualisations with sub-children (e.g. Indentation → sum/p99/stddev, Churn → days/commits/lines). Each entry knows its display order, help text, an optional `featureCheck` against the data file's `FeatureFlags` (git/coupling/git_details/file_stats — used to hide visualisations the loaded data can't support), and a `buildVisualization` factory.
5. **`src/visualizations/*.tsx`** implement `BaseVisualization<ScaleUnit>` (`BaseVisualization.tsx`): each provides `dataFn`/`parentFn` (extract a value from a file/directory node) and a `scale` (value → colour), and the base class handles the shared `fillFn` logic (neutral colour for undefined values, overrides for circle-pack backgrounds and not-yet-created files given the current date range).
6. **`Viz.tsx`** does the actual D3 rendering (Voronoi treemap / circle pack) against the `HierarchyNode<TreeNode>` tree, calling into the active visualisation's `fillFn`. It keeps the imperative shell — `draw`, `update`, the selection outline and the React component; everything separable lives in **`src/viz/`** (see below).
7. **`Controller.tsx`** / **`VisControlPanel.tsx`** / **`ColoursAndLinesControls.tsx`** hold the UI controls that dispatch `Action`s. **`inspectors/*`** render details about the currently selected node/path/team.

### Where things live

Four folders each hold one area's modules, with unit tests beside whatever is pure. They came out
of four files that had grown to 4,172 lines between them, each mixing several unrelated concerns
in one namespace, so the rule going in is that a module is about one thing and named for it.

- **`src/model/`** — reading a `TreeNode`: `teamStats.ts` (team and user aggregation),
  `gitChanges.ts`, `coupling.ts` and `couplingBuckets.ts`, `nodeAccessors.ts`. The accessors are a
  convenience layer, **not** an abstraction barrier over the JSON shape — that shape already leaks
  in seven other places, and `nodeAccessors.ts`'s header says so. The test for keeping a one-line
  accessor is whether its name says more than the field path it stands for.
- **`src/state/`** — `config.ts` (the `Config` shape, its defaults and `initialiseGlobalState`),
  `actions.ts`, `reducer.ts`, `derived.ts` (`postprocessState`) and `colours.ts`. `state.ts` itself
  keeps only the `State` shape, the small types it is built from, the `Message` constructors and
  the user-lookup helpers — what every module needs and none owns. The folder is a clean line,
  `config.ts` → `derived.ts` → `reducer.ts` → `colours.ts`, and `state.ts` imports nothing from it
  at runtime. `colours.ts` exists to keep it that way: `initialiseGlobalState` calls
  `postprocessState`, which needs `themedColours`, so without a leaf module `config.ts` and
  `derived.ts` would each need a value from the other.
- **`src/teams/`** — the Users and Teams modal. Logic: `pageStateEdits.ts`, `pageState.ts`,
  `importExport.ts`, `userList.ts`, `colourSchemes.ts`. Components: `UsersTable.tsx`,
  `TeamsTable.tsx`, `ImportExportControls.tsx`, `IgnoredUsersTable.tsx`, `UsersAndTeamsHelp.tsx`,
  plus `EditAlias.tsx`. `UsersAndTeams.tsx` is the modal shell. Two things to know: **the panel
  dispatches exactly one action, `setUserTeamAliasData`, and only on "save and close"** — that
  single action is its whole output, which is what makes `UsersAndTeams.test.tsx` cheap to write.
  And **`usersAndTeamsToPageFormat` deep-copies** the teams, aliases and ignored users it is
  handed, because the edits below it mutate in place; copying once when the modal opens is what
  makes cancel actually discard.
- **`src/viz/`** — everything separable out of `Viz.tsx`: `couplingArcs.ts` (the SVG arcs between
  coupled files), `timescale.ts` (the activity chart and its date brush), `cameraWiring.ts` (the
  imperative side of the camera — `refitCamera`, the `d3.zoom` behaviour, the resize/DPR watcher
  and GL context-loss recovery) and `vizRefs.ts` (the `VizRefs` bundle, its own leaf module so
  `Viz.tsx` and `cameraWiring.ts` need not import each other). `vizNodeSelection.ts` and
  `vizUpdatePaths.ts` predate the folder and are still at the top level. `Viz.tsx` is left at ~500
  lines on purpose: what remains is imperative D3 against a WebGL canvas with nothing pure left to
  lift out, and breaking up its effects would cost more than it bought.

**No tracked data file can render a coupling arc.** `default.json` has the coupling feature on and
14 buckets, but every `coupled_files` list in it is empty, and `nested.json` has coupling off
entirely. So neither the screenshot suite nor any manual look can exercise `couplingArcs.ts`
without a synthetic fixture — write `coupled_files` into a few of `default.json`'s coupling-bearing
nodes with `jq`, load it via `EXPLORER_DATA`, and delete it afterwards. Watch two things when you
do: a file's coupling buckets may sit outside the default date range, and the default
`minRatio` of 0.9 hides anything weaker until you drag the Coupling Ratio slider down. This is also
the sharpest reason to regenerate `default.json` (see "Known follow-ups") — the shipped sample
cannot demonstrate coupling at all.

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
ancestors whose algorithm is a circle type (`isCirclePacked`) — and two sites read it via
`nodeCircleAncestors` to offset `d.depth`: `Viz.tsx`'s selection stroke and `geometry.ts`'s
`outlineLevel`. Nesting strokes sit one level deeper than selection strokes; that 1-level
difference is deliberate, so keep the relationship if you touch those offsets. Compute this in
preprocess, not per-node-per-redraw — `Viz` redraws are performance-sensitive.

`nodeCircleAncestors` throws rather than defaulting when the field is missing, because 0 is
exactly the old buggy value and would show up as subtly-wrong nesting instead of a failure.

`depth === circleAncestors` is the test for "the layout draws this node itself as a circle" — it
says every ancestor is circle-packed. Those nodes need an outline of their own: a circle full of
packed circles has nothing tiling its boundary, so dropping them from the outline set makes the
group's circle vanish entirely — the regression the `omf.json` `nesteda`/`nestedc`/`nesteds`
groups are the case to check for.

The nesting levels are therefore split by kind, in `outlineLevel`: **every circle takes level 0**
("top level" in the Colours and Lines panel), however deeply the packing nests, and voronoi
nesting inside a circle starts at **level 1** — so levels 1-3 consistently mean "directories
inside a repo", whatever depth that repo's circle sits at. A file with no circle packing has no
level-0 circles to draw, so its top-level directories keep level 0 and nothing shifts. The root
is the only circle never outlined.

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
  SVG (`viz/cameraWiring.ts` attaches it) — attaching to an SVG element makes
  `d3.pointer()` resolve through that element's own `viewBox`, which
  double-applies the fit. `overlayGroupTransform()`
  pre-compensates the overlay `<g>`'s transform for the fact that its SVG also has
  a `viewBox`, so the browser doesn't apply the fit twice.
- `GlRenderer.ts` — the only stateful object: GL context, two programs (fill,
  outline), their buffers, `draw()`, `pick()`, `destroy()`. Requires
  `OES_element_index_uint` (WebGL1's native index type is `UNSIGNED_SHORT`, too
  small for these buffers) and throws in the constructor if it's unavailable.
  Exposes three update methods instead of one `render()` — see below. It holds no
  recovery logic of its own: a lost GL context is handled by
  `viz/cameraWiring.ts`'s `watchContextLoss`, which drops the renderer on
  `webglcontextrestored` and rebuilds from scratch via the `redrawAllRef` thunk
  `Viz.tsx`'s main effect keeps current.
- `geometry.ts` — `buildFills()`/`buildOutlines()`: tree nodes → typed arrays.
  Polygons are convex (Voronoi cells, circle approximations), so
  `triangulate.ts`'s `fanTriangulate()` is an exact triangulation, no earcut
  needed; `assertConvex()` (dev builds only) throws on a genuine concave turn but
  tolerates a collinear vertex, which the layout tool can legitimately produce.
  Outlines are one GPU quad per edge (`gl.LINES` with width>1 is unreliable across
  drivers), offset in the vertex shader so width stays constant in screen space —
  this reproduces `vector-effect: non-scaling-stroke` at zero per-frame cost.
  `outlineLevel()` is the exported, unit-tested nesting-level formula, and the
  one place a circle boundary is told from a nesting stroke.
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
detects the finest-grained case exactly (not heuristically): the `state/` reducer's
`setLines` action is the only one that ever touches nesting colours/widths and
touches nothing else, so "nesting fields differ, nothing else does" routes
straight to a uniform-only `setNestingStyle()` update with no buffer touched at
all. Node lists are cached per-`draw()` in `viz/vizRefs.ts`'s `VizRefs` as
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
line clean rather than reaching for a WebGL mock. The same line runs through
`src/viz/`: its pure parts (`arcPath`, `brushedDateRange`, `layoutSize` and the
rest) have unit tests, while the D3 selection code beside them does not.

**Known regression:** the canvas is opaque to screen readers, where the old SVG
`.cell`/`.nesting` paths were (unlabelled, but still) DOM nodes. Not fixed — see
"Known follow-ups".

### State import/export

`exportImport.ts` + `SaveLoadControls.tsx` let users save/load the whole `State` (config, teams/aliases, colours, etc., but not `calculated`) as JSON, independent of the underlying data file — this is how `*_state.json` sidecar files work. Not to be confused with `src/teams/importExport.ts`, which is the Users and Teams panel's own much narrower import/export of just the users, teams and aliases.

### Serving the data files

Data lives in top-level `data/`, which is deliberately **not** `publicDir` — scanner files run to
hundreds of MB and must never enter Vite's transform pipeline. Two small plugins in
`vite.config.ts` handle it instead: `serveDataDir` streams the directory off disk in dev,
`copyDataFile` emits exactly the one selected file at build time. Both carry comments on their
sharp edges; read them before changing either.

## Things that will bite you

- **Every displayed date and week bucket is UTC**, deliberately and throughout — see
  `docs/dates-and-timezones.md`. `humanizeDate` uses `Intl` with `timeZone: "UTC"` and the
  `en-US` locale (`en-GB` abbreviates September as "Sept"); week bucketing is integer arithmetic
  on unix days, with no `Date` involved. The single exception is `state/config.ts`'s
  `subYears`/`addDays`, which set the date slider's default bounds with ±2 days of deliberate
  leeway and stay on date-fns' local-calendar arithmetic; it is commented in place. That
  exception is also the only thing left that can make a screenshot baseline timezone-dependent,
  and only when those bounds cross a daylight-saving boundary.
- **`index.tsx` deliberately omits `React.StrictMode`**, and `react-hooks/refs` is off in
  `eslint.config.ts`. Both for the same reason: this app reads refs during render and does
  imperative D3 rendering in `Viz.tsx`, which StrictMode's double-invoked effects would break.
- **TypeScript is pinned to 6.x, not 7**, because `typescript-eslint` peer-caps at
  `typescript <6.1.0`. Check that cap before bumping.
- **`publish_*.sh` and `statefiles/` are gitignored on purpose** — they reference internal bucket
  names and have never been tracked. Don't "helpfully" commit them.
- **The Playwright fixtures are generated, not committed.** `tests/global-setup.ts` copies
  `data/default.json` → `data/explorertest.json` and `data/nested.json` →
  `data/explorernested.json` at run start, dropping the committed state sidecars beside them, so
  the fixtures track the tracked data files instead of duplicating a megabyte of JSON.
- **`data/nested.json`'s contributor list is anonymised, and must stay dense.** It is derived
  from a local `omf.json`, an open-source project whose committers are real people, so
  `metadata.git.users` was replaced wholesale with random names and `@example.com` addresses.
  Everything else references a user by numeric id, so that one list is the whole of it. All 210
  users are kept even though the pruned tree references far fewer, because the list must stay
  **dense**: `preprocess.indexUsersById` throws on load if `users[i].id !== i`, and `isAlias`
  treats any id `>= users.length` as an alias, so a gap makes the first alias collide with a real
  user. Pruning that list is the obvious "shrink the fixture" move and it does not work.
- **Two gotchas for any `@testing-library/react` test that drives a modal**, both solved in
  `UsersAndTeams.test.tsx`: react-modal hides the app element while the modal is open and
  Testing Library's role queries skip `aria-hidden`, so render into a container registered with
  `ReactModal.setAppElement`; and `onAfterOpen` fires from a `requestAnimationFrame`, so `await`
  before reading anything it seeded.
- **The screenshot suite's 2% tolerance (`maxDiffPixelRatio` in `playwright.config.ts`) can
  make `npm run e2e` pass clean while the actual pixels differ.** A real re-baseline (not just
  "does it currently pass") needs checking at zero tolerance first, or
  `npm run e2e:update` will silently leave a stale-but-still-passing baseline in place instead
  of updating it — confirmed doing exactly this during the WebGL rewrite's re-baseline, and
  again when re-baselining the circle outlines, where it reported "10 passed" and rewrote
  nothing. `npx playwright test --update-snapshots=all` rewrites regardless of tolerance; then
  `npm run e2e:strict` (which sets `STRICT_SCREENSHOTS`) proves the baselines actually moved.
- **`tests/helpers.ts`'s `selectAFileNode` clicks canvas coordinates, not a DOM
  element.** Since the WebGL rewrite there's no per-cell DOM node to target; it raster-scans a
  grid of canvas points and clicks the first one that resolves to a file. Which file that is
  can change if anything shifts the layout or the grid — it's deterministic given a fixed
  layout, not fixed in identity. Prefer `selectSubdirectory`, which clicks the Inspector's
  subdirectory buttons and so names the node it selects; the raster scan is only needed when the
  test specifically wants a _file_.

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
  coupling enabled and real git history. The tracked file is a hand-bumped 1.0.4-shaped one. The
  `chromium-nested` screenshot project now covers `nestedCircles` rendering, so this is no
  longer about test coverage — it is about the _shipped sample_ showing the awkward layout, and
  about coupling, which no tracked data file can draw at all (see "Where things live").
- **Re-verify against real scanner-generated multi-repo output** once
  `polyglot-code-offline-layout`'s `nested-circles` branch lands. The nested groups in the local
  `omf.json` smoke-test file were hand-built to match what `packChildren` produces; a real scan is
  the final word.
- **Data files above 512 MB cannot be loaded**, and the guard in `Loader.tsx` that refuses them
  reads `Content-Length`, so it is wrong behind gzip. Options for lifting the limit — streaming
  parsers, a chunked native parse, an NDJSON or columnar wire format — are measured and written
  up in `docs/large-data-files.md`. The heap cost of the parsed tree (~2.5x the JSON text), not
  the string cap, is what actually bounds this.
- **Consolidate the four `publish_*.sh` scripts.**
- **TypeScript 7** once `typescript-eslint` lifts its peer cap.
- **Better test coverage.** `src/model/`, `src/state/`, `src/teams/` and `src/viz/` now have
  tests beside their pure modules, and `datetimes.ts` and `preprocess.ts` have their own.
  `state/config.ts`'s no-git-dates branch calls `new Date()` directly, so it isn't testable as
  written. Korny is aware and content with this for now — don't add tests unasked.
