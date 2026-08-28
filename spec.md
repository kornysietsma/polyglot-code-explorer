# Spec: Polyglot Code Explorer — tooling & dependency refresh

**Status:** ready for implementation
**Date:** 2026-08-24
**Repo:** `polyglot-code-explorer` (branch off `master`)

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
- ❌ Not fine: changes to the visualisations themselves, to what the controls *do*, to the layout
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
- Establish a Playwright screenshot suite to prove the UI is unchanged.
- Update README / CLAUDE.md / release docs to match.

### Explicitly out of scope

- Redesigning the UI, changing the pane layout, or altering what any control does. (Incidental
  minor differences that fall out of the library swaps are expected — see *Design latitude* above.)
- Any change to the JSON data format or `SUPPORTED_FILE_VERSION` (`src/polyglot_data.types.ts`).
- Any change to the separate scanner tool.
- Backward compatibility with the old CLI (`yarn start`, `REACT_APP_*`) — deliberately dropped.
- New features. The `?data=` runtime override idea was considered and **rejected** for this work.

### Requirements that must survive

1. **Selectable data file at run/build time** — today `REACT_APP_EXPLORER_DATA=big yarn start`.
2. **A self-contained static html+js output directory** that can be pushed to S3, served from
   GitHub Pages, or unzipped and served locally with `python3 -m http.server`.

---

## 2. Decisions

| Area | Decision |
|---|---|
| Build tool | **Vite 8** + `@vitejs/plugin-react` 6 |
| Package manager | **npm** (delete `yarn.lock`, `yarn-error.log`) |
| Node | **24 LTS**; pinned via `.nvmrc` + `engines` |
| React | **19.2** |
| TypeScript | **6.0.3** — latest version `typescript-eslint` supports (`>=4.8.4 <6.1.0`); **not** TS 7 |
| Stale deps | Replace with maintained libraries (not hand-rolled, not force-installed) |
| `react-widgets` `NumberPicker` | → `react-aria-components` `NumberField` |
| `use-onclickoutside` | → `useInteractOutside` from `react-aria` |
| `moment` | → `date-fns` (already a declared, currently-unused dependency) |
| Data file selection | Unprefixed **`EXPLORER_DATA`** env var, mapped explicitly in `vite.config.ts` |
| Base path | **`base: "./"`** — one artifact works at bucket root, Pages sub-path, or local folder |
| Data files | Moved out of `public/` to top-level `data/`; dev-served by middleware; build copies **only** the selected file |
| Tests | **Vitest 4** |
| Verification | **Playwright screenshot baselines**, captured on the current CRA app *before* migrating — used as a human review aid, not a pass/fail gate |
| Screenshot determinism | Pinned `*_state.json` sidecar fixture (no clock mocking) |
| Lint / format | **ESLint 10 flat config** + `typescript-eslint` 8.68 + **Prettier 3.9** as a separate script |
| GitHub Actions | **Deleted entirely** — no CI |
| Release artifacts | **Dropped** — users build from source |
| `publish_*.sh` | Ported as-is (yarn→npm, `build`→`dist`); not consolidated |
| Cleanup | Remove CRA cruft, dead deps, and the stray `console.log`s in `Loader.tsx` |
| Sequencing | Staged commits on one branch |

---

## 3. Findings from the current codebase

These shaped the decisions above and the implementer should know them:

- **`react-widgets/styles.css` is never imported.** The two `NumberPicker`s therefore currently
  render as *unstyled* markup. This substantially lowers the risk of swapping them out — but the
  replacement must be checked against the baseline screenshots regardless.
- **Sass already uses `@use`, not the deprecated `@import`** (`src/css/custom.scss:13-17`).
  No Sass module migration is needed.
- **`index.tsx` deliberately does not use `React.StrictMode`.** Keep it that way — StrictMode's
  double-invoked effects would very likely break the imperative D3 rendering in `Viz.tsx`.
- **Voronoi polygons are pre-computed in the data file** (`Viz.tsx` reads `d.data.layout.polygon`).
  Rendering is deterministic; there is no layout randomness to seed.
- **The only wall-clock dependency is `state.ts:331-332`**, which defaults the date range to
  `moment().subtract(2, "year")` → `moment().add(2, "day")`. This is why screenshots need a
  pinned state fixture.
- **`public/data/` is 2.4 GB across 35 JSON files**, untracked but *not* gitignored. CRA copies all
  of it into `build/` on every build, which is why `publish_s3.sh` does `yarn build` then
  `rm build/data/*.json`.
- **`immer` is a declared dependency referenced only in a TODO comment** (`state.ts:980`).
  `date-fns` is declared and never imported. `eslint-config-airbnb`, `eslint-plugin-import`,
  `eslint-plugin-jsx-a11y` and `eslint-import-resolver-typescript` are devDependencies that
  `.eslintrc.json` never extends.
- **`typescript-plugin-css-modules` is configured but there are no `*.module.css` files.**
  The `global.d.ts` module declarations for them are dead too.
- **`process.env` usage is limited to four lines**: `App.tsx:70` (`REACT_APP_VERSION`) and
  `Loader.tsx:128-130` (`REACT_APP_EXPLORER_DATA`, `PUBLIC_URL` ×2).

---

## 4. Target dependency set

### Runtime dependencies

| Package | From | To | Note |
|---|---|---|---|
| `react` / `react-dom` | 18.2 | **19.2.8** | |
| `d3` | 7.3 | **7.9.0** | |
| `lodash` | 4.17.21 | **4.18.1** | |
| `date-fns` | 2.28 (unused) | **4.4.0** | now actually used |
| `semver` | 7.3.7 | **7.8.5** | |
| `react-modal` | 3.15 | **3.16.3** | peers already include React 19 |
| `react-colorful` | 5.6.1 | **5.8.0** | maintained (Jul 2026) |
| `use-debouncy` | 4.3 | **6.0.0** | maintained (Jul 2026), React 19 peers — **keep** |
| `react-aria-components` | — | **1.20.0** | **new** — `NumberField` |
| `react-aria` | — | **3.51.0** | **new** — `useInteractOutside` |
| `moment` | 2.27 | — | **removed** |
| `react-widgets` | 5.8.4 | — | **removed** |
| `use-onclickoutside` | 0.4.1 | — | **removed** |
| `immer` | 9.0.15 | — | **removed** (unused) |
| `web-vitals` | 2.1 | — | **removed** |
| `sass` | 1.54 | — | → devDependency `sass-embedded` **1.103.1** |

### Dev dependencies

| Package | Version | Note |
|---|---|---|
| `vite` | 8.2.2 | |
| `@vitejs/plugin-react` | 6.1.0 | |
| `typescript` | 6.0.3 | |
| `vitest` | 4.1.11 | |
| `jsdom` | 30.0.1 | Vitest DOM environment |
| `@playwright/test` | 1.62.1 | |
| `@testing-library/react` | 16.3.2 | React 19 compatible |
| `@testing-library/jest-dom` | 7.0.1 | |
| `@testing-library/user-event` | 14.6.6 | keep only if used |
| `eslint` | 10.9.1 | |
| `typescript-eslint` | 8.68.0 | new unified package |
| `eslint-plugin-react-hooks` | 7.1.1 | |
| `eslint-plugin-react-refresh` | 0.5.4 | new — Vite HMR safety |
| `eslint-plugin-simple-import-sort` | 14.0.0 | |
| `globals` | 17.11.0 | flat-config env globals |
| `prettier` | 3.9.6 | |
| `sass-embedded` | 1.103.1 | |
| `@types/d3` | 7.4.3 | d3 ships no types |
| `@types/lodash` | 4.17.25 | |
| `@types/semver` | 7.8.0 | |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.5 | |
| `@types/react-modal` | 3.16.3 | |
| `@types/node` | matching Node 24 | |
| `ts-unused-exports` | latest | keep if still wanted |

**Removed dev deps:** `react-scripts`, `eslint-config-airbnb`, `eslint-config-prettier`,
`eslint-plugin-prettier`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
`eslint-import-resolver-typescript`, `eslint-plugin-react` (superseded by the hooks/refresh
plugins for this ruleset — reinstate only if a specific rule is missed),
`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` (replaced by `typescript-eslint`),
`typescript-plugin-css-modules`, `@types/jest`.

---

## 5. Detailed changes

### 5.1 Repository layout

```
.
├── data/                     # NEW — the 2.4 GB of JSON, moved from public/data/
│   ├── default.json
│   └── ...
├── public/                   # only genuinely-static assets (favicon etc.)
├── src/                      # unchanged structure
├── tests/
│   ├── fixtures/
│   │   ├── explorertest.json        # copy of default.json (746 KB)
│   │   └── explorertest_state.json  # pinned date range / vis / colours / theme
│   └── screenshots.spec.ts
├── dist/                     # build output (was build/)
├── index.html                # NEW location — Vite serves it from project root
├── vite.config.ts
├── vitest.config.ts          # or a `test` block in vite.config.ts
├── playwright.config.ts
├── eslint.config.ts
├── tsconfig.json
├── .nvmrc
├── .prettierrc
└── package.json
```

- `data/` must be added to `.gitignore` (the current `public/data/*.json` files are untracked but
  **not ignored**, which is a trap).
- `/build` in `.gitignore` becomes `/dist`.
- `public/index.html` moves to `./index.html` and drops all `%PUBLIC_URL%` templating
  (use `./favicon.ico` etc.). Keep `<body data-theme="dark">` and `<div id="root">` exactly as-is.
- Delete `public/manifest.json`, `public/logo192.png`, `public/logo512.png` **only after
  confirming nothing references them** (the `<link rel="manifest">` and apple-touch-icon tags in
  `index.html` do — remove those tags too, or keep both).

### 5.2 `vite.config.ts`

Must do five things:

1. **`base: "./"`** — relative asset URLs.
2. **`build.outDir: "dist"`**.
3. **Expose `EXPLORER_DATA`** — via `define`, e.g.
   `__EXPLORER_DATA__: JSON.stringify(process.env.EXPLORER_DATA ?? "default")`.
   Declare it in `src/global.d.ts`. (Using `define` rather than Vite's `VITE_`-prefixed
   `import.meta.env` is a deliberate choice so the unprefixed variable name is preserved.)
4. **Expose the app version** — `__APP_VERSION__: JSON.stringify(pkg.version)`, read from
   `package.json`. This replaces `process.env.REACT_APP_VERSION` in `App.tsx:70`.
5. **Serve and emit the data files:**
   - *Dev:* a small plugin using `configureServer` to mount the top-level `data/` directory at
     `/data`, so the dev server can serve multi-hundred-MB JSON without Vite scanning or
     transforming it. `data/` must **not** be `publicDir`.
   - *Build:* a `closeBundle`/`writeBundle` hook that copies exactly one file —
     `data/${EXPLORER_DATA ?? "default"}.json` → `dist/data/${EXPLORER_DATA ?? "default"}.json`,
     plus `..._state.json` if it exists. Fail the build with a clear error if the named file is
     missing.

   **Naming contract:** the built app requests the *same* filename it was built with. A plain
   `npm run build` therefore emits `dist/data/default.json` and the app requests
   `data/default.json` — exactly matching today's behaviour and the README's "copy your own JSON
   over `data/default.json`" instruction, so the ported `publish_*.sh` scripts keep working.

### 5.3 Source changes

Deliberately minimal. The complete list:

| File | Change |
|---|---|
| `src/App.tsx:70` | `process.env.REACT_APP_VERSION` → `__APP_VERSION__` |
| `src/Loader.tsx:128` | `process.env.REACT_APP_EXPLORER_DATA \|\| "default"` → `__EXPLORER_DATA__` |
| `src/Loader.tsx:129-130` | `${process.env.PUBLIC_URL}/data/...` → `${import.meta.env.BASE_URL}data/...` (note: `BASE_URL` carries a trailing slash) |
| `src/Loader.tsx:142,144` | delete the two stray `console.log` calls |
| `src/index.tsx` | drop the `reportWebVitals` import and call; keep `ReactModal.setAppElement("#root")`; **do not** add `StrictMode` |
| `src/reportWebVitals.ts` | delete |
| `src/global.d.ts` | remove the dead `*.module.css` declarations; add `/// <reference types="vite/client" />` and `declare const __APP_VERSION__: string; declare const __EXPLORER_DATA__: string;` |
| `src/datetimes.ts`, `src/preprocess.ts`, `src/state.ts` | replace `moment` with `date-fns` (see 5.4) |
| `src/ColoursAndLinesControls.tsx` | replace `NumberPicker` with `react-aria-components` `NumberField` (see 5.4) |
| `src/widgets/ColourPicker.tsx` | replace `useOnClickOutside` with `useInteractOutside` from `react-aria` |
| `src/state.ts:980` | update or drop the stale `immer` TODO comment |
| `src/setupTests.ts` | keep; referenced from Vitest `setupFiles` |

### 5.4 Library swap details

**`moment` → `date-fns`.** Three call sites:
- `state.ts:331-332`: `moment().subtract(2, "year").unix()` → `getUnixTime(subYears(new Date(), 2))`;
  `moment().add(2, "day").unix()` → `getUnixTime(addDays(new Date(), 2))`.
- `preprocess.ts` imports `moment, { unitOfTime }` — `unitOfTime` is a moment *type*. Replace with a
  local union type (`"day" | "week" | "month" | ...` — read the actual usage) and map each branch
  to the corresponding `date-fns` function.
- `datetimes.ts` — straightforward conversion helpers.

⚠️ Watch for moment's **mutability** and its lenient parsing; date-fns is immutable and strict.
Also confirm UTC-vs-local handling matches, since `Viz.tsx` uses `scaleUtc`.

**`react-widgets` `NumberPicker` → `react-aria-components` `NumberField`.**
Two instances in `ColoursAndLinesControls.tsx` (and check for others). Both use
`defaultValue` / `step={1}` / `min={0}` / `max={20}` / `onChange`. Map to
`NumberField` with `defaultValue` / `step` / `minValue` / `maxValue` / `onChange`, containing
`Group` + `Input` + increment/decrement `Button`s. The old widget was unstyled, so add just enough
CSS in `src/css/custom.scss` for the new one to sit comfortably alongside the surrounding controls
— **do not chase pixel-equivalence with the old markup**. A tidy, legible spinner that follows
React Aria's conventions is the goal. Note `NumberField`'s `onChange` yields `number` (`NaN` when
empty), whereas the existing code guards with `newWidth || 1` — preserve that guard's *intent*
(never dispatch a zero/NaN width), however it is best expressed.

**`use-onclickoutside` → `react-aria`'s `useInteractOutside`.**
In `ColourPicker.tsx`, `useOnClickOutside(popover, close)` becomes
`useInteractOutside({ ref: popover, onInteractOutside: close })`. `useInteractOutside` fires on
pointer-down where `use-onclickoutside` fired on click, so the dismiss timing will differ slightly
— that is acceptable. What must still work: the popover opens from the swatch, stays open while
you drag inside the colour picker, and closes on an outside interaction without immediately
reopening. Verify that cycle by hand.

### 5.5 TypeScript config

Move to the Vite split: `tsconfig.json` (references) + `tsconfig.app.json` + `tsconfig.node.json`.

Carry over verbatim, as they are load-bearing for this codebase:
`"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`,
`"noImplicitReturns": true`, `"noFallthroughCasesInSwitch": true`,
`"forceConsistentCasingInFileNames": true`, `"resolveJsonModule": true`,
`"isolatedModules": true`, `"jsx": "react-jsx"`, `"noEmit": true`.

Changes: `target` `es2015` → `ES2022`; `moduleResolution` `node` → `bundler`;
drop `allowJs`; drop the `typescript-plugin-css-modules` plugin entry.

**Do not enable `verbatimModuleSyntax`** — it would force `import type` churn across every file
for no benefit here.

Expect new errors from TS 6 + `@types/react` 19 (notably: `React.FC` no longer implies `children`;
`useRef` requires an explicit initial argument). Fix them as type-only changes; do not restructure
components.

### 5.6 npm scripts

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

### 5.7 Lint & format

- `eslint.config.ts` flat config. Port every rule from `.eslintrc.json` **including**
  `"@typescript-eslint/no-non-null-assertion": "off"` — this is deliberate and documented in
  `README.md`/`CLAUDE.md` as the convention for working with `noUncheckedIndexedAccess`.
- Keep `simple-import-sort/imports` and `/exports` as errors, and
  `"@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^_.*" }]`.
- Keep type-aware linting: `projectService: true` in the flat config's `languageOptions.parserOptions`.
- Add `eslint-plugin-react-refresh` (Vite HMR correctness).
- **Remove** `eslint-plugin-prettier` / `eslint-config-prettier`; Prettier runs standalone.
  Move the inline Prettier options to `.prettierrc`:
  `{ "trailingComma": "es5", "singleQuote": false, "semi": true }`.
- Prettier 3 changed the default `trailingComma` to `"all"` — the explicit `"es5"` above preserves
  current formatting, so **run `npm run format` as its own commit** to keep formatting churn out of
  the substantive diffs.
- Delete `.eslintrc.json`.

### 5.8 Testing

**Vitest** — `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/setupTests.ts"]`.
`src/nodeData.test.ts` should port with no or near-no changes. The current
`transformIgnorePatterns` hack for `d3`/`internmap`/`delaunator`/`robust-predicates` in
`package.json` is **deleted** — Vite handles ESM natively, which is one of the concrete wins here.

**Playwright** — `tests/screenshots.spec.ts`, using `toHaveScreenshot()` against committed
baselines. Config: single Chromium project, fixed viewport (e.g. 1600×1000),
`webServer` running `EXPLORER_DATA=explorertest npm run dev`.

> **These screenshots are a review aid, not a pass/fail gate.** Given the design latitude in §1,
> minor diffs around the swapped controls are expected and acceptable. Their job is to make every
> visual change *visible* so it can be a deliberate choice rather than an accident — the failure
> mode they exist to catch is an unnoticed regression in a visualisation, colour scale, or layout
> that nobody looked at.
>
> Practical consequences: set a tolerant `maxDiffPixelRatio` (~0.02) so trivial antialiasing noise
> doesn't cry wolf; treat any reported diff as "open the image and decide"; and re-baseline with
> `npm run e2e:update` once a difference has been eyeballed and accepted. Do **not** wire this into
> a blocking check. The strictness that *does* matter is on the visualisation canvas — if a Voronoi
> or circle-pack render differs at all, that is a real bug, since those polygons come pre-computed
> from the data file.

Fixture: `tests/fixtures/explorertest.json` (copy of the 746 KB `default.json`) and
`tests/fixtures/explorertest_state.json`, which pins the date range, selected visualisation,
colours and theme via the app's existing `*_state.json` sidecar mechanism. Both are copied into
`data/` for the run (or `data/` is where they live). Using the app's real state-loading path means
no clock mocking and no test-only code, and it incidentally exercises `exportImport.ts`.

Screenshots to capture — **on the current CRA app, before any migration work**:
- Initial load (full page).
- Each top-level visualisation and each sub-visualisation from `VisualizationData.tsx`
  (Lines of code, Indentation ×3, Age, Creation date, Churn ×3, Number of changers, Language,
  Team, Single team, Team pattern).
- Voronoi treemap **and** circle-pack modes.
- Each inspector: node selected (file), directory selected, path inspector, coupling inspector,
  source-code inspector.
- Each control panel expanded, including Colours and Lines (**the `NumberField` swap lands here**)
  and the colour picker popover open.
- Users & Teams modal, and the Edit Alias modal.
- Both `data-theme` values if the app supports toggling.

### 5.9 Docs & scripts

- **`README.md`** — rewrite the install/run sections: Node 24 + `npm install`;
  `npm start`; `EXPLORER_DATA=big npm start`; `npm run build` → `dist/`.
  **Delete the "Running from a static release" section** and the GitHub-releases links —
  the instruction is now to build from source. Keep the `python3 -m http.server` tip, retargeted
  at `dist/`. Keep the `noUncheckedIndexedAccess` / non-null-assertion convention section.
- **`CLAUDE.md`** — update the Commands section (yarn → npm, `build/` → `dist/`, Vitest,
  `npm run typecheck`/`lint`), note the `data/` directory and the Playwright suite, and replace the
  release-process paragraph.
- **`Releasing.md`** — delete, or reduce to "bump `package.json` version, update `CHANGELOG.md`,
  tag, push" with no artifact step.
- **`.github/workflows/main.yml`** — delete; remove `.github/` if it ends up empty.
- **`publish_s3.sh`, `publish_e3sm.sh`, `publish_gdspub.sh`, `publish_whitehall.sh`** — port as-is:
  `yarn build` → `npm run build`, `build/` → `dist/`. The `rm dist/data/*.json` lines can stay
  (now cheap and harmless) or go; the `cp ... dist/data/default.json` lines are unchanged, though
  their source paths move from `public/data/` to `data/`.
- **`.nvmrc`** containing `24`, and `"engines": { "node": ">=24" }` in `package.json`.
- Delete `yarn.lock` and `yarn-error.log`; commit `package-lock.json`.

---

## 6. Migration plan — staged commits on one branch

Branch: `tooling-refresh`. Each stage must leave the app runnable and is independently
screenshot-verifiable, so any regression bisects to a single commit.

Note the asymmetry: **stages 3 and 7 touch no UI code, so a clean screenshot run is a genuine
expectation there** — any diff is a real regression. Stage 4 is the only stage where visual
differences are legitimate, which is precisely why the library swaps are isolated into it.

| # | Stage | Done when |
|---|---|---|
| 1 | **Baselines.** Add Playwright + fixtures; capture screenshots against the *current, unmodified* CRA app. | Baseline images committed; `npx playwright test` passes twice in a row (proves determinism). |
| 2 | **npm + Node.** Delete `yarn.lock`; `npm install`; add `.nvmrc`, `engines`. Still CRA. | `npm start` and `npm run build` work; screenshots still pass. |
| 3 | **CRA → Vite.** Add `vite.config.ts`, move `index.html` to root, tsconfig split, env/`PUBLIC_URL` source edits, npm scripts. Remove `react-scripts`. **No dependency version bumps yet.** | `npm start` serves the app; `npm run build` emits a working `dist/`; screenshots pass. |
| 4 | **React 19 + TS 6 + dep upgrades**, including the `react-aria` `NumberField`, `useInteractOutside` and `date-fns` swaps. | `npm run typecheck` clean; screenshot diffs reviewed — visualisation canvas unchanged, control-level diffs accepted and re-baselined. Highest-risk stage. |
| 5 | **Vitest.** Replace the Jest setup; drop `transformIgnorePatterns`. | `npm test` passes. |
| 6 | **ESLint 10 flat config + Prettier 3.** Split the formatting-only reflow into its own commit. | `npm run lint` and `npm run format:check` clean. |
| 7 | **`data/` restructure + single-file build.** Move `public/data/` → `data/`, add the dev middleware and build copy hook, update `.gitignore`. | `EXPLORER_DATA=QGIS npm run build` completes in seconds and emits exactly `dist/data/QGIS.json`; a plain `npm run build` emits `dist/data/default.json`; screenshots pass. |
| 8 | **Cleanup & docs.** Remove `reportWebVitals`, `console.log`s, dead deps and CRA leftovers; rewrite README/CLAUDE.md; delete `.github/`, `Releasing.md`; port the publish scripts. | `npm run check` clean; `dist/` served from a sub-path and from a bucket root both work. |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| `useInteractOutside` fires on pointer-down, not click — colour-picker popover may fail to open, or close at the wrong moment | Manual check of the full open/drag/dismiss cycle (stage 4). Changed *timing* is acceptable; a popover that won't open or that closes mid-drag is not |
| `NumberField` renders different markup than the unstyled `NumberPicker` | Expected and acceptable. Style it to sit well with neighbouring controls; use the baselines to confirm nothing *else* moved as a side effect |
| `moment` → `date-fns` semantic drift (mutability, UTC vs local, lenient parsing) | Convert call-by-call; `Viz.tsx` uses `scaleUtc`, so verify the timescale axis explicitly |
| `@types/react` 19 breaking type changes (`React.FC` children, `useRef` args) cascade widely | Contained to stage 4; fix as type-only edits |
| Prettier 3 reformats the whole codebase | Explicit `trailingComma: "es5"`; formatting-only commit isolated in stage 6 |
| Dev server struggles serving 100 MB+ JSON files | Custom middleware bypasses Vite's transform pipeline entirely; test with `servo_quick.json` (122 MB) |
| Moving `public/data/` breaks the untracked local data files | They are untracked — `git mv` won't help; move with `mv` and confirm before committing the `.gitignore` change |
| TS 6 deprecation warnings for things TS 7 removes | Fix them as they appear; this is the point of choosing 6 over 5.9 |

---

## 8. Acceptance criteria

1. `npm install` on Node 24; no `yarn.lock`; `package-lock.json` committed.
2. `EXPLORER_DATA=big npm start` serves the app at `localhost:3000`-equivalent with `data/big.json` loaded.
3. `npm run build` produces `dist/` in seconds, containing the app plus exactly one data JSON.
4. `dist/` works unchanged when served from: a bucket root, a GitHub Pages project sub-path, and
   `python3 -m http.server` inside the unzipped folder.
5. `npm run check` (typecheck + lint + format + unit tests) passes clean.
6. `npx playwright test` has been run against the stage-1 baselines and **every reported diff has
   been opened, reviewed and consciously accepted or fixed**, with the baselines updated to match
   the new intended appearance. Diffs around the swapped `NumberField` and colour-picker popover
   are expected; diffs on the visualisation canvas, colour scales, or pane layout are bugs.
7. No `react-widgets`, `use-onclickoutside`, `moment`, `immer`, `web-vitals` or `react-scripts` in
   `package.json`.
8. `.github/` and the release-artifact documentation are gone; README tells users to build from source.
9. The app's `SUPPORTED_FILE_VERSION` and data-format handling are byte-for-byte unchanged.

---

## 9. Open questions for the implementer

- Is `@testing-library/user-event` actually used anywhere? If not, drop it.
- Is `ts-unused-exports` still wanted? It has no npm script today.
- Confirm which `data-theme` values the app supports, so the screenshot matrix covers them all.
- `public/favicon.ico` / `manifest.json` / `logo192.png` / `logo512.png`: keep the favicon, decide
  on the rest once `index.html` is rewritten.
