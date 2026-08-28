# Spec: Polyglot Code Explorer — tooling & dependency refresh

**Status:** complete — all plan steps and gates passed (see `plan.md`); this file describes the
resulting state, not a history of how we got here
**Repo:** `polyglot-code-explorer`, branch `big-cleanup` (not yet merged to `master`)
**Companion:** [`plan.md`](./plan.md) — the ordered, checkable implementation plan

---

## 1. Goal

Bring a 2022-era Create React App project up to current tooling and library versions, with **no
major change to how the application looks or behaves**.

### Design latitude

This is not a pixel-fidelity exercise. The governing principle is **simplicity — work with the
libraries, not against them**. Where following a library's natural grain produces a slightly
different control, spacing, or interaction, that is acceptable and often preferable to writing
compatibility CSS or wrapper logic to force the old appearance.

- ✅ Fine: a `NumberField` whose spinner buttons sit differently or are styled by the library's
  own conventions; a popover that dismisses on pointer-down rather than click; minor spacing,
  focus-ring, or keyboard-affordance differences.
- ❌ Not fine: changes to the visualisations themselves, to what the controls _do_, to the layout
  of the three main panes, to the colour scales, or anything that would make a saved
  `*_state.json` behave differently.

When in doubt: take the simpler implementation and note the difference, rather than adding code to
preserve the old look.

### In scope

- Replace create-react-app / `react-scripts` with Vite.
- Upgrade React, TypeScript, D3 and all other runtime and dev dependencies to current versions.
- Replace yarn with npm; target a current Node.js LTS.
- Replace unmaintained dependencies with actively-maintained equivalents.
- Replace the Jest-via-react-scripts test setup with Vitest.
- Move ESLint to flat config, Prettier to a standalone step.
- Restructure how the (2.4 GB) data files are served and built so builds are fast.
- Establish a Playwright screenshot suite as a regression net.
- **Fix circle-packed layout handling** (§3.2) — the explorer doesn't understand the layout tool's
  `nestedCircles` mode, and the mechanism it uses can't express variable circle depth. The one
  deliberate behaviour change in this project.
- Update README / CLAUDE.md / release docs to match.

### Explicitly out of scope

- Redesigning the UI, changing the pane layout, or altering what any control does. (Incidental
  minor differences that fall out of the library swaps are expected — see _Design latitude_ above.)
- Any change to the JSON data format or `SUPPORTED_FILE_VERSION` (`src/polyglot_data.types.ts`).
- Any change to the separate scanner tool.
- Backward compatibility with the old CLI (`yarn start`, `REACT_APP_*`) — deliberately dropped.
- New features. The `?data=` runtime override idea was considered and **rejected**.

### Requirements that must survive

1. **Selectable data file at run/build time** — today `REACT_APP_EXPLORER_DATA=big yarn start`.
2. **A self-contained static html+js output directory** that can be pushed to S3, served from
   GitHub Pages, or unzipped and served locally with `python3 -m http.server`.

---

## 2. Decisions

| Area                                | Decision                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build tool                          | **Vite 8** + `@vitejs/plugin-react` 6                                                                                                                                                                                                                                       |
| Package manager                     | **npm** (delete `yarn.lock`, `yarn-error.log`); **no `.npmrc`** — a real `npm install` resolves cleanly once `@testing-library/react` is off its React-18-only v13 peer range (step 4.1); re-add `legacy-peer-deps=true` only if a future bump reintroduces a real conflict |
| Node                                | **24 LTS**; pinned via `.nvmrc` + `engines`                                                                                                                                                                                                                                 |
| Dev server port                     | **Vite's default, 5173** — not CRA's 3000; not fought, per the simplicity principle above                                                                                                                                                                                   |
| React                               | **19.2**                                                                                                                                                                                                                                                                    |
| TypeScript                          | **6.0.3** — latest version `typescript-eslint` supports (`>=4.8.4 <6.1.0`); **not** TS 7                                                                                                                                                                                    |
| Stale deps                          | Replace with maintained libraries (not hand-rolled, not force-installed)                                                                                                                                                                                                    |
| `react-widgets` `NumberPicker` (×5) | → `react-aria-components` `NumberField`                                                                                                                                                                                                                                     |
| `use-onclickoutside`                | → `useInteractOutside` from `react-aria`                                                                                                                                                                                                                                    |
| `moment`                            | → `date-fns` (already a declared, currently-unused dependency)                                                                                                                                                                                                              |
| Data file selection                 | Unprefixed **`EXPLORER_DATA`** env var, mapped explicitly in `vite.config.ts`                                                                                                                                                                                               |
| Base path                           | **`base: "./"`** — one artifact works at bucket root, Pages sub-path, or local folder                                                                                                                                                                                       |
| Data files                          | Moved out of `public/` to top-level `data/`; dev-served by middleware; build copies **only** the selected file                                                                                                                                                              |
| Tests                               | **Vitest 4**                                                                                                                                                                                                                                                                |
| Verification                        | **Playwright screenshot baselines** — 10 core shots, used as a review aid, not a pass/fail gate                                                                                                                                                                             |
| Screenshot determinism              | Pinned `*_state.json` sidecar fixture (no clock mocking)                                                                                                                                                                                                                    |
| Lint / format                       | **ESLint 10 flat config** + `typescript-eslint` 8.68 + **Prettier 3.9** as a separate script                                                                                                                                                                                |
| GitHub Actions                      | **Deleted entirely** — no CI                                                                                                                                                                                                                                                |
| Release artifacts                   | **Dropped** — users build from source; the zips were never fetched and cost more than they returned                                                                                                                                                                         |
| `publish_*.sh`                      | Ported as-is (yarn→npm, `build`→`dist`); not consolidated; stay gitignored, not committed — reference internal bucket names, were never tracked before this refresh                                                                                                         |
| Cleanup                             | Remove CRA cruft, dead deps, and the stray `console.log`s in `Loader.tsx`                                                                                                                                                                                                   |
| Sequencing                          | Staged commits on one branch                                                                                                                                                                                                                                                |

---

## 3. Findings from the current codebase

Established by reading the code. These shaped the decisions above.

### 3.1 Data file versioning is exact-match

`Loader.tsx:34` uses `semver.satisfies(data.version, SUPPORTED_FILE_VERSION)` with a bare version
as the range — which means **exact equality**, not "compatible with". `SUPPORTED_FILE_VERSION` is
`"1.0.5"` (bumped in `763f13f`, Apr 2026, which changed _only_ that constant — no type or shape
change).

Consequence: every file in `public/data/` was 1.0.4 or older and none would load. The tracked
`default.json` has since been hand-bumped to 1.0.5 (`70effdf`) and works. The other 34 untracked
local files remain stale and will not load without the same treatment.

### 3.2 Circle-packed layouts are mis-handled 🔴

**`circlePack` and `nestedCircles` are two legitimate, different layout modes**, not a rename.
Both are produced by the separate layout tool
(`../polyglot-code-offline-layout/layout.js`, branch `nested-circles`):

| Mode            | Flag               | Structure                                                                                                       |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `circlePack`    | `--circles`        | Circles at the top level only; voronoi below                                                                    |
| `nestedCircles` | `--nested-circles` | `packChildren` recurses, circle-packing **until `isGitRepoRoot(child)`**, then that subtree switches to voronoi |

The explorer knows only about `circlePack`. `NodeLayout.algorithm` is typed as bare `string`, so
nothing caught this. Two places test for it:

| Site                                              | Effect on a `nestedCircles` file                      |
| ------------------------------------------------- | ----------------------------------------------------- |
| `BaseVisualization.tsx:110`                       | circle-pack background colour never applied           |
| `Loader.tsx:65` → `metadata.topLevelCirclePacked` | **depth offsets wrong** at `Viz.tsx:84, 92, 123, 426` |

The second is the serious one: it shifts the nesting depth used for line widths and nested colours
— precisely the feature added in the two most recent commits (`6371a3f` "added fourth nesting
level", `763f13f` "fixed bug in deeply nested colours").

**The boolean is structurally inadequate.** In nested mode the number of circle levels **varies per
branch**, because repos sit at different depths. `topLevelCirclePacked` is a single global flag
feeding a _constant_ offset, which cannot express "how many circle levels are above _this_ node".

`omf.json` demonstrates this directly (see §4): its root is `nestedCircles`, three of its
top-level children (`nesteda`, `nestedc`, `nesteds`) are `circlePack` wrappers containing further
repos, and its other ten top-level children are plain `voronoi`. So 1010 nodes sit below one circle
level and 1157 below two, **in the same tree**. No single flag can be right for both.

**Target state:** replace `metadata.topLevelCirclePacked: boolean` with a **per-node count of
circle-algorithm ancestors**, computed once in `preprocess.ts` (the tree is already walked there,
and `Viz` redraws are performance-sensitive — do not walk ancestors per node per redraw).

Define `circleAncestors(node)` = number of _strict_ ancestors whose `layout.algorithm` is a circle
type. Then the four call sites become:

| Site                                                | Was                             | Becomes                              |
| --------------------------------------------------- | ------------------------------- | ------------------------------------ |
| `Viz.tsx:84`, `:92` (nesting stroke width / colour) | `d.depth - (flag ? 2 : 1)`      | `d.depth - (circleAncestors(d) + 1)` |
| `Viz.tsx:123` (selection stroke width)              | `d.depth - (flag ? 1 : 0)`      | `d.depth - circleAncestors(d)`       |
| `Viz.tsx:426` (`depthAdjust` filter)                | `d.depth >= 1 + (flag ? 1 : 0)` | `d.depth >= 1 + circleAncestors(d)`  |

This reproduces today's behaviour exactly wherever circles are root-only (`circleAncestors` is 0
for a pure-voronoi file and 1 for everything below a circle-packed root), preserves the deliberate
1-level difference between nesting strokes and selection strokes, and stays correct at variable
depth. Under it, the first voronoi level gets no nesting stroke and the level below it is nesting
level 0 — consistent in both modes.

`NodeLayout.algorithm` also becomes a union (`"voronoi" | "circlePack" | "nestedCircles"`), and a
shared `isCirclePacked(algorithm)` helper serves both `BaseVisualization.tsx` and the preprocess
step, so the two cannot drift again.

### 3.3 Rendering is deterministic; only the date range is not

- **Voronoi polygons are pre-computed in the data file** (`Viz.tsx` reads `d.data.layout.polygon`).
  There is no layout randomness to seed — screenshot testing is viable.
- **The only wall-clock dependency is `state.ts:331-332`**, which defaults the date range to
  `moment().subtract(2, "year")` → `moment().add(2, "day")`. Hence the pinned state fixture.
  Confirmed during implementation (plan step 0.3): this branch only runs when the loaded data has
  no dates at all (`hasDates` false). `default.json`/`explorertest.json` have git data, so their
  default date range is already derived from the file's own commit history
  (`state.ts:313-333`, the `hasDates` branch) and was deterministic even before the fixture existed.
  The pinned sidecar still earns its place — it fixes the _visualization and theme_ shown on initial
  load, and is a safety net if the fixture data ever changes to something without dates.

### 3.4 UI structure (relevant to driving it from Playwright)

- Visualisation and sub-visualisation are `<select>`s with real `<label htmlFor>` — "Visualization:"
  and "Sub-visualisation:" (`Controller.tsx:260, 280`).
- Theme is a button toggling between "Light theme" / "Dark theme" (`Controller.tsx:73-95`);
  `data-theme` is `"dark" | "light"`, defaulting to `dark`.
- `ToggleablePanel` renders `<h4>{title} <button>show|hide</button></h4>`.
- **Circle-pack is not a UI mode** — it is a per-node `layout.algorithm` baked into the data file.

### 3.5 Dead and stale code

- **`react-widgets/styles.css` is never imported**, so the five `NumberPicker`s currently render as
  _unstyled_ markup. This substantially lowers the risk of swapping them out.
- `ColoursAndLinesControls.tsx` has **5** `NumberPicker` + 5 `ColourPicker` pairs (1 default + 4
  nesting levels, after `6371a3f`).
- **`src/global.d.ts` is entirely dead** — it contains only a `*.module.css` declaration, and there
  are no `*.module.css` files. `typescript-plugin-css-modules` is likewise configured but unused.
- **`src/setupTests.ts` imports `@testing-library/jest-dom/extend-expect`** — a subpath **removed in
  jest-dom v6+**. It will break on the version bump regardless of Vitest.
- `immer` is a declared dependency referenced only in a TODO comment (`state.ts:980`). `date-fns` is
  declared and never imported. `@testing-library/user-event` and `ts-unused-exports` are declared
  and never used.
- `eslint-config-airbnb`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and
  `eslint-import-resolver-typescript` are devDependencies that `.eslintrc.json` never extends.
- **`process.env` usage is limited to four lines**: `App.tsx:70` (`REACT_APP_VERSION`) and
  `Loader.tsx:128-130` (`REACT_APP_EXPLORER_DATA`, `PUBLIC_URL` ×2).

### 3.6 Things that are already fine

- **Sass already uses `@use`**, not the deprecated `@import` (`src/css/custom.scss:13-17`).
- **`index.tsx` deliberately does not use `React.StrictMode`.** Keep it that way — StrictMode's
  double-invoked effects would very likely break the imperative D3 rendering in `Viz.tsx`.
- **`public/data/` is 2.4 GB across 35 JSON files**, untracked except `default.json`, and not
  gitignored. CRA copies all of it into `build/` on every build, which is why `publish_s3.sh` does
  `yarn build` then `rm build/data/*.json`.

---

## 4. Fixtures

Two data files with different jobs. Neither alone covers everything.

| File                | Version             | Size   | git                            | coupling    | root algorithm                 | Role                                                 |
| ------------------- | ------------------- | ------ | ------------------------------ | ----------- | ------------------------------ | ---------------------------------------------------- |
| `data/default.json` | 1.0.5 (hand-bumped) | 746 KB | ✅ 102/102 files, 3 users      | ✅ 14 files | `circlePack`                   | **Committed regression fixture** + shipped default   |
| `data/omf.json`     | 1.0.5 (scanner)     | 3.9 MB | ✅ ~1300/1739 files, 207 users | ❌          | `nestedCircles` + `circlePack` | **Manual smoke test** — untracked, too big to commit |

`default.json` is the automated fixture: small, tracked, root-only-circle, and the only file
exercising coupling.

`omf.json` is the manual one, and the only file that can verify the §3.2 fix. It is in genuine
current scanner format and has been hand-extended with three nested repo groups (`nesteda`,
`nestedc`, `nesteds`) so that circle depth **varies within one tree**:

| Node                              | depth | algorithm       | `circleAncestors` |
| --------------------------------- | ----- | --------------- | ----------------- |
| root                              | 0     | `nestedCircles` | 0                 |
| `nesteda`, `nestedc`, `nesteds`   | 1     | `circlePack`    | 1                 |
| ten other top-level branches      | 1     | `voronoi`       | 1                 |
| everything below the nested three | 2+    | `voronoi`       | **2**             |

1010 nodes at `circleAncestors=1`, 1157 at `=2`. This is the case the old boolean cannot represent.

### 4.1 Avoiding a duplicated 746 KB

The Playwright run needs a data file _plus_ a pinned `_state.json` sidecar. Committing
`explorertest.json` as a second copy of `default.json` would duplicate 746 KB and let the two
drift. Instead:

- Commit **only** `tests/fixtures/explorertest_state.json` (small).
- `tests/global-setup.ts` copies `default.json` → `explorertest.json` beside it at run start, and
  puts the state fixture next to it. Both copies are gitignored.
- Tests run with `EXPLORER_DATA=explorertest`.

The fixture therefore tracks the shipped default automatically, and the state sidecar never affects
a normal `npm start`.

---

## 5. Target dependency set

### Runtime dependencies

| Package                 | From          | To         | Note                                             |
| ----------------------- | ------------- | ---------- | ------------------------------------------------ |
| `react` / `react-dom`   | 18.2          | **19.2.8** |                                                  |
| `d3`                    | 7.3           | **7.9.0**  |                                                  |
| `lodash`                | 4.17.21       | **4.18.1** |                                                  |
| `date-fns`              | 2.28 (unused) | **4.4.0**  | now actually used                                |
| `semver`                | 7.3.7         | **7.8.5**  |                                                  |
| `react-modal`           | 3.15          | **3.16.3** | peers already include React 19                   |
| `react-colorful`        | 5.6.1         | **5.8.0**  | maintained (Jul 2026)                            |
| `use-debouncy`          | 4.3           | **6.0.0**  | maintained (Jul 2026), React 19 peers — **keep** |
| `react-aria-components` | —             | **1.20.0** | **new** — `NumberField`                          |
| `react-aria`            | —             | **3.51.0** | **new** — `useInteractOutside`                   |
| `moment`                | 2.27          | —          | **removed**                                      |
| `react-widgets`         | 5.8.4         | —          | **removed**                                      |
| `use-onclickoutside`    | 0.4.1         | —          | **removed**                                      |
| `immer`                 | 9.0.15        | —          | **removed** (unused)                             |
| `web-vitals`            | 2.1           | —          | **removed**                                      |
| `sass`                  | 1.54          | —          | → devDependency `sass-embedded` **1.103.1**      |

### Dev dependencies

| Package                             | Version          | Note                                                                                       |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `vite`                              | 8.2.2            |                                                                                            |
| `@vitejs/plugin-react`              | 6.1.0            |                                                                                            |
| `typescript`                        | 6.0.3            |                                                                                            |
| `vitest`                            | 4.1.11           |                                                                                            |
| `jsdom`                             | 30.0.1           | Vitest DOM environment                                                                     |
| `@playwright/test`                  | 1.62.1           |                                                                                            |
| `@testing-library/react`            | 16.3.2           | React 19 compatible                                                                        |
| `@testing-library/jest-dom`         | 7.0.1            |                                                                                            |
| `eslint`                            | 10.9.1           |                                                                                            |
| `@eslint/js`                        | 10.0.1           | `js.configs.recommended` — flat config needs it explicitly, not implied by `eslint` itself |
| `typescript-eslint`                 | 8.68.0           | new unified package                                                                        |
| `eslint-plugin-react-hooks`         | 7.1.1            |                                                                                            |
| `eslint-plugin-react-refresh`       | 0.5.5            | new — Vite HMR safety                                                                      |
| `eslint-plugin-simple-import-sort`  | 14.0.0           |                                                                                            |
| `globals`                           | 17.11.0          | flat-config env globals                                                                    |
| `jiti`                              | 2.7.0            | ESLint 10 needs it to load a `.ts` config file                                             |
| `prettier`                          | 3.9.6            |                                                                                            |
| `sass-embedded`                     | 1.103.1          |                                                                                            |
| `@types/d3`                         | 7.4.3            | d3 ships no types                                                                          |
| `@types/lodash`                     | 4.17.25          |                                                                                            |
| `@types/semver`                     | 7.8.0            |                                                                                            |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.5 |                                                                                            |
| `@types/react-modal`                | 3.16.3           |                                                                                            |
| `@types/node`                       | matching Node 24 |                                                                                            |

**Removed dev deps:** `react-scripts`, `eslint-config-airbnb`, `eslint-config-prettier`,
`eslint-plugin-prettier`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
`eslint-import-resolver-typescript`, `eslint-plugin-react` (superseded by the hooks/refresh plugins
for this ruleset — reinstate only if a specific rule is missed), `@typescript-eslint/parser`,
`@typescript-eslint/eslint-plugin` (replaced by `typescript-eslint`),
`typescript-plugin-css-modules`, `@types/jest`, `@testing-library/user-event` (unused),
`ts-unused-exports` (unused).

---

## 6. Detailed changes

### 6.1 Repository layout

```
.
├── data/                     # the 2.4 GB of JSON, moved from public/data/
│   ├── default.json          # tracked; everything else gitignored
│   └── ...
├── public/                   # only genuinely-static assets (favicon etc.)
├── src/                      # unchanged structure
├── tests/
│   ├── fixtures/
│   │   └── explorertest_state.json  # pinned date range / vis / colours / theme
│   ├── global-setup.ts
│   └── screenshots.spec.ts
├── dist/                     # build output (was build/)
├── index.html                # moved from public/ — Vite serves it from project root
├── vite.config.ts
├── playwright.config.ts
├── eslint.config.ts
├── tsconfig.json + tsconfig.app.json + tsconfig.node.json
├── .nvmrc
├── .prettierrc
├── .prettierignore
└── package.json
```

- `/data` is gitignored with a `!data/default.json` exception so the shipped default stays tracked.
- `/build` in `.gitignore` becomes `/dist`.
- `public/index.html` moves to `./index.html` and drops all `%PUBLIC_URL%` templating.
  Keep `<body data-theme="dark">` and `<div id="root">` exactly as-is.
- `.prettierignore` is required, not optional — `data/`'s untracked scanner files run up to hundreds
  of MB and `prettier --check .` OOMs without an exclusion. Also ignores `/dist`, `/statefiles`,
  Playwright artifacts, `package-lock.json` (npm-managed), and `/.claude` (local settings).

### 6.2 `vite.config.ts`

Must do five things:

1. **`base: "./"`** — relative asset URLs.
2. **`build.outDir: "dist"`**.
3. **Expose `EXPLORER_DATA`** — via `define`, e.g.
   `__EXPLORER_DATA__: JSON.stringify(process.env.EXPLORER_DATA ?? "default")`.
   Declared in `src/global.d.ts`. (Using `define` rather than Vite's `VITE_`-prefixed
   `import.meta.env` is deliberate, so the unprefixed variable name is preserved.)
4. **Expose the app version** — `__APP_VERSION__: JSON.stringify(pkg.version)`, read from
   `package.json`. Replaces `process.env.REACT_APP_VERSION` at `App.tsx:70`.
5. **Serve and emit the data files:**
   - _Dev:_ a small plugin using `configureServer` to mount the top-level `data/` directory at
     `/data`, so the dev server can serve multi-hundred-MB JSON without Vite scanning or
     transforming it. `data/` must **not** be `publicDir`. Hand-rolled (stream via
     `createReadStream`, no new dependency) rather than pulling in a static-file-serving package.
     **A missing file must get a real 404, answered directly** — calling `next()` and letting the
     request fall through lets Vite's SPA fallback serve `index.html` (200 OK) instead, which
     silently breaks any caller expecting a normal fetch failure (e.g. `Loader.tsx`'s handling of a
     data file with no `_state.json` sidecar).
   - _Build:_ a `writeBundle` hook that copies exactly one file —
     `data/${EXPLORER_DATA ?? "default"}.json` → `dist/data/` — plus its `_state.json` if one
     exists. Fail the build with a clear error if the named file is missing.

   **Naming contract:** the built app requests the _same_ filename it was built with. A plain
   `npm run build` therefore emits `dist/data/default.json` and the app requests
   `data/default.json` — matching today's behaviour and the README's "copy your own JSON over
   `data/default.json`" instruction, so the ported `publish_*.sh` scripts keep working.

### 6.3 Source changes

| File                                                    | Change                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/polyglot_data.types.ts`                            | `algorithm: string` → union; add `isCirclePacked()` helper (§3.2)                                                                              |
| `src/preprocess.ts`                                     | compute per-node `circleAncestors` while walking the tree (§3.2)                                                                               |
| `src/viz.types.ts:38`                                   | drop `topLevelCirclePacked: boolean` from `VizMetadata`                                                                                        |
| `src/Loader.tsx:65`                                     | drop the `topLevelCirclePacked` computation                                                                                                    |
| `src/Viz.tsx:84, 92, 123, 426`                          | use `circleAncestors` per the table in §3.2                                                                                                    |
| `src/visualizations/BaseVisualization.tsx:110`          | use `isCirclePacked()`                                                                                                                         |
| `src/App.tsx:70`                                        | `process.env.REACT_APP_VERSION` → `__APP_VERSION__`                                                                                            |
| `src/Loader.tsx:128`                                    | `process.env.REACT_APP_EXPLORER_DATA \|\| "default"` → `__EXPLORER_DATA__`                                                                     |
| `src/Loader.tsx:129-130`                                | `${process.env.PUBLIC_URL}/data/...` → `${import.meta.env.BASE_URL}data/...` (`BASE_URL` carries a trailing slash)                             |
| `src/Loader.tsx:142,144`                                | delete the two stray `console.log` calls                                                                                                       |
| `src/index.tsx`                                         | drop the `reportWebVitals` import and call; keep `ReactModal.setAppElement("#root")`; **do not** add `StrictMode`                              |
| `src/reportWebVitals.ts`                                | delete                                                                                                                                         |
| `src/global.d.ts`                                       | replace wholesale: `/// <reference types="vite/client" />` + `declare const __APP_VERSION__: string; declare const __EXPLORER_DATA__: string;` |
| `src/datetimes.ts`, `src/preprocess.ts`, `src/state.ts` | replace `moment` with `date-fns` (§6.4)                                                                                                        |
| `src/ColoursAndLinesControls.tsx`                       | replace all 5 `NumberPicker`s with `NumberField` (§6.4)                                                                                        |
| `src/widgets/ColourPicker.tsx`                          | replace `useOnClickOutside` with `useInteractOutside`                                                                                          |
| `src/state.ts:980`                                      | update or drop the stale `immer` TODO comment                                                                                                  |
| `src/setupTests.ts`                                     | `@testing-library/jest-dom/extend-expect` → `@testing-library/jest-dom/vitest`                                                                 |

### 6.4 Library swap details

**`moment` → `date-fns`.** Three call sites:

- `datetimes.ts` — `humanizeDate` (`moment.unix(d).format("DD-MMM-YYYY")` →
  `format(fromUnixTime(d), "dd-MMM-yyyy")`, which produces identical output), `dateToUnix` →
  `getUnixTime`, `unixToDate` → `fromUnixTime`.
- `state.ts` — `initialiseGlobalState`'s default date-range calculation, **both branches**: the
  `hasDates` branch (`moment.unix(latestData).subtract(2, "year")` / `.add(2, "day")` →
  `getUnixTime(subYears(fromUnixTime(latestData), 2))` /
  `getUnixTime(addDays(fromUnixTime(latestData), 2))`) and the no-dates fallback →
  `getUnixTime(subYears(new Date(), 2))` / `getUnixTime(addDays(new Date(), 2))`.
- `preprocess.ts` — imports `moment, { unitOfTime }`, where `unitOfTime.StartOf` is a moment
  _type_. `gatherTimescaleData` is called from exactly one place (`Loader.tsx:54`) and always with
  `"week"`, so replace the type with a narrow local union rather than reproducing moment's whole
  `StartOf` type. Pin `startOfWeek(d, { weekStartsOn: 0 })` explicitly — moment's default is
  locale-dependent and only _happens_ to be Sunday for `en`.

⚠️ Watch for moment's mutability and lenient parsing; date-fns is immutable and strict. Confirm
UTC-vs-local handling matches, since `Viz.tsx` uses `scaleUtc`.

**`react-widgets` `NumberPicker` → `react-aria-components` `NumberField`.**
All **5** instances in `ColoursAndLinesControls.tsx`. Each uses `defaultValue` / `step={1}` /
`min={0}` / `max={20}` / `onChange`; map to `NumberField` with `defaultValue` / `step` /
`minValue` / `maxValue` / `onChange`, containing `Group` + `Input` + increment/decrement `Button`s.
The old widget was unstyled, so add just enough CSS in `src/css/custom.scss` for the new one to sit
comfortably alongside neighbouring controls — **do not chase pixel-equivalence**. Note
`NumberField`'s `onChange` yields `number` (`NaN` when empty), whereas the existing code guards
with `newWidth || 1` — preserve that guard's _intent_ (never dispatch a zero/NaN width), however
it is best expressed.

**`use-onclickoutside` → `react-aria`'s `useInteractOutside`.**
In `ColourPicker.tsx`, `useOnClickOutside(popover, close)` becomes
`useInteractOutside({ ref: popover, onInteractOutside: close })`. `useInteractOutside` fires on
pointer-down where `use-onclickoutside` fired on click, so dismiss timing differs slightly — that
is acceptable. What must still work: the popover opens from the swatch, stays open while you drag
inside the colour picker, and closes on an outside interaction without immediately reopening.

### 6.5 TypeScript config

Move to the Vite split: `tsconfig.json` (references) + `tsconfig.app.json` + `tsconfig.node.json`.

Carry over verbatim, as they are load-bearing here: `"strict": true`,
`"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`, `"noImplicitReturns": true`,
`"noFallthroughCasesInSwitch": true`, `"forceConsistentCasingInFileNames": true`,
`"resolveJsonModule": true`, `"isolatedModules": true`, `"jsx": "react-jsx"`, `"noEmit": true`.

Changes: `target` `es2015` → `ES2022`; `moduleResolution` `node` → `bundler`; drop `allowJs`; drop
the `typescript-plugin-css-modules` plugin entry.

`tsconfig.node.json` (covers `vite.config.ts`) needs the equivalent treatment: `module` /
`moduleResolution` `node16`/`node16` → `ESNext`/`bundler` (Vite's own template setting), and
`target` `es2015` → `ES2022`. It isn't wired into the root project's `references` until the TS 6
step, so that is the first time `vite.config.ts` is typechecked at all — without the change, TS
treats the extensionless `.ts` file as CommonJS (no `"type": "module"` in `package.json`) and fails
to `require()` the ESM-only `vite`/`@vitejs/plugin-react` packages (TS1479).

**Do not enable `verbatimModuleSyntax`** — it would force `import type` churn across every file for
no benefit here.

Expect new errors from TS 6 + `@types/react` 19 (notably: `React.FC` no longer implies `children`;
`useRef` requires an explicit initial argument). Fix them as type-only changes; do not restructure
components.

### 6.6 npm scripts

```json
"scripts": {
  "dev":        "vite",
  "start":      "vite",
  "build":      "tsc -b && vite build",
  "preview":    "vite preview",
  "test":       "vitest run",
  "test:watch": "vitest",
  "e2e":        "playwright test",
  "e2e:update": "playwright test --update-snapshots",
  "typecheck":  "tsc -b --noEmit",
  "lint":       "eslint src",
  "lint:fix":   "eslint src --fix",
  "format":     "prettier --write .",
  "format:check": "prettier --check .",
  "check":      "npm run typecheck && npm run lint && npm run format:check && npm run test"
}
```

`start` is aliased to `dev` so `EXPLORER_DATA=big npm start` reads naturally. The `eject` script is
deleted. Vite does not auto-open a browser by default, which replaces the old `BROWSER=none` trick.

### 6.7 Lint & format

- `eslint.config.ts` flat config, composed with ESLint core's `defineConfig`/`globalIgnores` from
  `eslint/config` — **not** `typescript-eslint`'s own `tseslint.config()` helper, which is now
  deprecated in favour of this.
- Port every rule from `.eslintrc.json` **including**
  `"@typescript-eslint/no-non-null-assertion": "off"` — deliberate, and documented in
  `README.md`/`CLAUDE.md` as the convention for working with `noUncheckedIndexedAccess`.
- Keep `simple-import-sort/imports` and `/exports` as errors, and
  `"@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^_.*" }]`.
- Keep type-aware linting: `projectService: true` in `languageOptions.parserOptions`. TS-rule
  preset is `tseslint.configs.recommended`, **not** `recommendedTypeChecked` — the old config used
  the non-type-checked preset, and switching surfaces ~90 pre-existing `no-unsafe-*` findings that
  are out of scope for this refresh; `projectService` stays on regardless, so type info is
  available if a future step wants it.
- Add `eslint-plugin-react-refresh` (Vite HMR correctness) and `eslint-plugin-react-hooks` 7's
  `recommended-latest`, which now bundles the full "Rules of React" set, not just
  `rules-of-hooks`/`exhaustive-deps`. Two deliberate exceptions to that new ruleset, both intended
  to stay:
  - **`react-hooks/refs` is off**, with a comment explaining why. This app deliberately reads a
    ref's `.current` during render to bridge imperative D3 rendering with React state
    (`dataRef`/`stateRef` — the same reason `index.tsx` avoids `StrictMode`, §3.6); the rule's
    React-Compiler-oriented model doesn't fit that pattern.
  - **`react-refresh/only-export-components`** found 3 files with a deliberate
    component-plus-helper co-location (`SingleTeamVisualization.tsx`, `UserTeamList.tsx`,
    `widgets/TeamWidget.tsx`) — disabled per-line with a comment rather than splitting the files.
- **Remove** `eslint-plugin-prettier` / `eslint-config-prettier`; Prettier runs standalone.
  Move the inline Prettier options to `.prettierrc`:
  `{ "trailingComma": "es5", "singleQuote": false, "semi": true }`.
- Prettier 3 changed the default `trailingComma` to `"all"` — the explicit `"es5"` preserves
  current formatting, and the reflow gets its own commit.
- Delete `.eslintrc.json`.

### 6.8 Testing

**Vitest** — `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/setupTests.ts"]`.
`src/nodeData.test.ts` should port with near-zero changes. The current `transformIgnorePatterns`
hack for `d3`/`internmap`/`delaunator`/`robust-predicates` in `package.json` is **deleted** — Vite
handles ESM natively, which is one of the concrete wins here.

**Playwright** — `tests/screenshots.spec.ts` using `toHaveScreenshot()` against committed
baselines. Single Chromium project, fixed viewport (1600×1000), `maxDiffPixelRatio: 0.02`,
`webServer` running the dev server with `EXPLORER_DATA=explorertest`.

The **core set is 10 shots**:

| #   | Shot                                | Why it earns its place                                                 |
| --- | ----------------------------------- | ---------------------------------------------------------------------- |
| 1   | Initial load, full page             | Layout / pane regressions                                              |
| 2   | Lines of code (voronoi canvas)      | Baseline colour scale + polygon render                                 |
| 3   | Indentation → p99                   | Exercises the parent/sub-visualisation selector                        |
| 4   | Age                                 | Git-dependent + **date-sensitive** — catches `moment`→`date-fns` drift |
| 5   | Churn → lines                       | Second git path, different scale type                                  |
| 6   | Team                                | Exercises `calculated` user→team derivation                            |
| 7   | File node selected (inspector open) | Inspector rendering + `humanizeDate` output                            |
| 8   | "Colours and Lines" panel expanded  | Where all 5 `NumberField` swaps land                                   |
| 9   | Colour picker popover open          | Where the `useInteractOutside` swap lands                              |
| 10  | Initial load, light theme           | Theme-dependent colour tokens                                          |

Deliberately omitted: coupling controls, the Users/Teams and Edit Alias modals, remaining
sub-visualisations — no library swap touches them, and the manual sweep covers them by eye.

> **These screenshots are a review aid, not a pass/fail gate.** Their job is to make every visual
> change _visible_ so it is a deliberate choice rather than an accident. Treat any reported diff as
> "open the image and decide", re-baseline with `npm run e2e:update` once accepted, and do **not**
> wire this into a blocking check.
>
> Strictness is asymmetric: steps that touch no UI code must produce **zero** diffs, and any diff
> on the visualisation canvas is a real bug, since those polygons come pre-computed from the data
> file.

### 6.9 Docs & scripts

- **`README.md`** — rewrite install/run: Node 24 + `npm install`; `npm start`;
  `EXPLORER_DATA=big npm start`; `npm run build` → `dist/`. **Delete the "Running from a static
  release" section** and the GitHub-releases links. Keep the `python3 -m http.server` tip,
  retargeted at `dist/`. Keep the `noUncheckedIndexedAccess` convention section.
- **`CLAUDE.md`** — update Commands (yarn → npm, `build/` → `dist/`, Vitest, typecheck/lint), note
  the `data/` directory and the Playwright suite, replace the release-process paragraph.
- **`Releasing.md`** — delete, or reduce to "bump `package.json` version, update `CHANGELOG.md`,
  tag, push" with no artifact step.
- **`.github/workflows/main.yml`** — delete; remove `.github/` if it ends up empty.
- **`publish_s3.sh`, `publish_e3sm.sh`, `publish_gdspub.sh`, `publish_whitehall.sh`** — port as-is:
  `yarn build` → `npm run build`, `build/` → `dist/`, source paths `public/data/` → `data/`. These
  reference internal bucket names and were never tracked in git before this refresh — keep them
  that way, gitignored rather than committed.
- **`.nvmrc`** containing `24`, and `"engines": { "node": ">=24" }` in `package.json`.
- Delete `yarn.lock` and `yarn-error.log`; commit `package-lock.json`.

---

## 7. Risks

| Risk                                                                                                           | Mitigation                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useInteractOutside` fires on pointer-down, not click — popover may fail to open, or close at the wrong moment | Manual check of the full open/drag/dismiss cycle. Changed _timing_ is acceptable; a popover that won't open or closes mid-drag is not |
| `NumberField` renders different markup than the unstyled `NumberPicker`                                        | Expected and acceptable. Style it to sit well with neighbours; use the baselines to confirm nothing _else_ moved                      |
| `moment` → `date-fns` semantic drift (mutability, UTC vs local, lenient parsing)                               | Convert call-by-call; `Viz.tsx` uses `scaleUtc`, so verify the timescale axis explicitly                                              |
| `@types/react` 19 breaking type changes cascade widely                                                         | Isolated to its own step; fix as type-only edits                                                                                      |
| Prettier 3 reformats the whole codebase                                                                        | Explicit `trailingComma: "es5"`; formatting-only commit                                                                               |
| Dev server struggles serving 100 MB+ JSON                                                                      | Custom middleware bypasses Vite's transform pipeline; test with `servo_quick.json` (122 MB)                                           |
| Moving `public/data/` breaks untracked local data files                                                        | 34 of 35 are untracked — move with plain `mv`, `git mv` only `default.json`, verify `git status` before committing                    |
| `default.json` hand-bumped to 1.0.5 masks a genuine format difference                                          | Verified by eye — it renders correctly. §8 follow-up regenerates it properly                                                          |
| TS 6 deprecation warnings for things TS 7 removes                                                              | Fix as they appear; this is the point of choosing 6 over 5.9                                                                          |

---

## 8. Acceptance criteria

All nine confirmed passing at plan step 7.4 (Gate M7).

1. `npm install` on Node 24; no `yarn.lock`; `package-lock.json` committed.
2. `EXPLORER_DATA=big npm start` serves the app with `data/big.json` loaded.
3. `npm run build` produces `dist/` in seconds, containing the app plus exactly one data JSON.
4. `dist/` works unchanged when served from: a bucket root, a GitHub Pages project sub-path, and
   `python3 -m http.server` inside the unzipped folder.
5. `npm run check` (typecheck + lint + format + unit tests) passes clean.
6. `npm run e2e` has been run and **every reported diff opened, reviewed and consciously accepted
   or fixed**, with baselines updated to match the new intended appearance. Diffs around the
   swapped `NumberField` and colour-picker popover are expected; diffs on the visualisation canvas,
   colour scales, or pane layout are bugs.
7. No `react-widgets`, `use-onclickoutside`, `moment`, `immer`, `web-vitals` or `react-scripts` in
   `package.json`.
8. `.github/` and the release-artifact documentation are gone; README tells users to build from
   source.
9. `SUPPORTED_FILE_VERSION` and data-format handling are unchanged, and `omf.json` renders with
   correct nesting depth (the §3.2 fix).

---

## 9. Follow-ups (explicitly out of scope)

1. **Regenerate `default.json` with the current scanner** — small, `nestedCircles` root, coupling
   enabled, real git history. Replaces the hand-bumped 1.0.4-shaped file, and gives the regression
   suite the fiddlier layout case. (Korny's stated intent: `nestedCircles` is the awkward one, so
   the shipped default should eventually use it, with `omf.json` covering the other.)
2. **Re-verify against scanner-generated multi-repo output** once
   `polyglot-code-offline-layout`'s `nested-circles` branch lands. `omf.json`'s nested groups were
   added by hand; the shapes match what `packChildren` produces, but a real scan is the final word.
3. **Consolidate the four `publish_*.sh` scripts** — deferred by choice.
4. **TypeScript 7** once `typescript-eslint` supports it (currently peer-capped at `<6.1.0`).

---

## 10. Resolved questions (step 7.1)

- The six progress `console.log`s in `Loader.tsx` ("linking parents", "postprocessing
  languages"…) are kept — genuinely useful signal for large scanner files. The two stray
  per-render logs ("in loader, errors", "state ref now") were removed.
- `favicon.ico` / `logo192.png` didn't actually exist in `public/` (discovered at 6.1) — sourced
  real files from `polyglot-tools-docs/source_images/icon-{48,192,512}.png` (`icon-48.png` →
  `favicon.ico` via `sips -s format ico`) rather than dropping the references. `logo512.png` added
  too and wired into `manifest.json`'s previously-empty `icons` array.
