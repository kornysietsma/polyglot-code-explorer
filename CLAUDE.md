# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The front-end (Create React App + TypeScript + D3) for visualising a codebase as a Voronoi/circle-pack treemap, coloured by metrics like lines of code, age, churn, indentation, or git team ownership. It only *renders* data — the JSON data files it consumes are produced by a separate scanner tool (not in this repo); see <https://polyglot.korny.info>. The JSON data format is versioned (`SUPPORTED_FILE_VERSION` in `src/polyglot_data.types.ts`) and changes with the app, so old data files can stop working - changes to the scanner need to be in sync with changes to this front-end.

## Commands

- `yarn install` — install dependencies (uses yarn, not npm)
- `yarn start` — run dev server at localhost:3000, loads `public/data/default.json`
- `REACT_APP_EXPLORER_DATA=foo yarn start` — load `public/data/foo.json` instead (and optionally `public/data/foo_state.json` for saved UI state)
- `yarn build` — production build
- `yarn test` / `yarn test --watchAll` — run the (sparse) Jest test suite; there is no lint or typecheck npm script, run `npx eslint src` / `npx tsc --noEmit` directly
- Release process is documented in `Releasing.md`: bump `package.json` version, tag `vX.Y.Z`, push tags — GitHub Actions (`.github/workflows/main.yml`) builds a zip and publishes a GitHub release on tag push.

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

### State import/export

`exportImport.ts` + `SaveLoadControls.tsx` let users save/load the `State` (config, teams/aliases, colours, etc., but not `calculated`) as JSON, independent of the underlying data file — this is how `*_state.json` sidecar files work.

## TypeScript conventions specific to this repo

`tsconfig.json` enables `noUncheckedIndexedAccess`, which TypeScript doesn't fully reconcile with manual bounds-checks. The established convention (see `README.md`) is:
- Use non-null assertion (`!`) when an index is provably in range from a preceding check — `@typescript-eslint/no-non-null-assertion` is deliberately disabled for this reason.
- Where the index *isn't* provably safe, throw an explicit `Error` on `undefined` rather than silently coercing, e.g. `if (colour == undefined) throw new Error("Logic error: invalid colour index")`.

Import ordering is enforced by `simple-import-sort` via eslint (not manually maintained).
