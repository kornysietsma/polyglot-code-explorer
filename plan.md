# Plan — test clarity, then expressiveness refactor

Three phases, in order. Phase 2 is the expressiveness refactor and is deliberately left
under-specified until phase 1 lands, because phase 1's reading of the code is what should shape
it.

---

## Phase 1 — tests first

Ordered so every change that can move pixels lands _before_ the screenshot work, and the
baselines are rewritten once rather than once per fix. So: 1.2 defects, then 1.1 e2e, then the
rest.

### 1.1 Nested-circles e2e coverage

- [x] Generate and commit `data/nested.json` (367 KB, 217 nodes, depth 13): `nesteda` +
      `nestedc` circle groups plus the `qclib` and `tac` voronoi siblings, 5 children per
      directory. Built once with a throwaway script, not a committed one.
- [x] Anonymise its 35 contributors — random names and `@example.com` addresses, ids kept so the
      tree still resolves.
- [x] Commit `tests/fixtures/explorernested_state.json` — a pinned UI state sidecar, mirroring
      how `explorertest_state.json` works. Pick a depth that shows nesting levels 0-2.
- [x] `tests/global-setup.ts`: also copy `nested.json` → `data/explorernested.json` and its
      state sidecar.
- [x] `playwright.config.ts`: second `webServer` on 5174 with `EXPLORER_DATA=explorernested`;
      second project `chromium-nested` with that `baseURL` and `testMatch`.
- [x] `tests/nested-screenshots.spec.ts` — a small set, each shot chosen to make a _specific_
      thing visible rather than to add coverage for its own sake: - initial load (circle boundaries at every nesting depth present, none vanished) - depth control reduced, so directory cells are drawn where files were - a nesting colour/width change via Colours and Lines (the `setLines` uniform-only path,
      which today has unit coverage but no visual proof) - one visualisation switch (`setColours` path over a nested tree) - light theme
- [x] Baselined with `--update-snapshots=all`, then verified at zero tolerance. Added
      `npm run e2e:strict` so that check is a command rather than a manual config edit.

### 1.2 Fix the confirmed defects (test first, then fix)

Spec table order. Each is a failing test, then a one- or two-line fix.

- [x] `commonRoots` identical-path overcount — new `nodeData.test.ts` describe block covering
      identical paths, shared prefixes, no prefix, and one path a prefix of the other.
- [x] `gatherNodeStats`'s `??`/`>` precedence — fix and cover the empty-details case that the
      guard was meant to catch.
- [x] `days.sort()` numeric — test with timestamps of differing digit counts.
- [x] `stripTabs` → `replaceAll`, with a multi-tab name test.
- [x] `humanizeDays` boundaries (`>=`) and `humanizeDays(0)` → `"0 days"`; test the 6/7/8 and
      364/365/366 boundaries.
- [x] `addTimescaleData`'s `file_stats` branch buckets by week, like the git branch does.

### 1.3 Extract for testability

- [ ] Pull `Viz.tsx` `draw()`'s two `descendants().filter(...)` chains into a pure module
      (`vizNodeSelection.ts`), keeping `vizUpdatePaths.ts`'s "outside `src/webgl/`, pure, no
      `gl` import" convention.
- [ ] Unit-test it against a nested fixture tree, including the case CLAUDE.md names: a circle
      whose children are all circles must stay in the outline set.
- [ ] Extend `src/testFixtures.ts` with a small nested-tree builder so `preprocess.test.ts`,
      `geometry.test.ts` and the new selection tests stop each rolling their own
      `directory()`/`file()` helpers.

### 1.4 Fill the genuine gaps, prune the rest

- [ ] `preprocess.ts` — one integration-style test over a small `PolyglotData` covering
      `gatherGlobalStats`, `gatherTimescaleData`'s week bucketing (Sunday pinning, commits
      merging into one bucket, and the same bucketing on the `file_stats` branch), and
      `countLanguagesIn`'s colour-exhaustion fallback to `otherColour`.
- [ ] `BaseVisualization.fillFn` — one test pinning the three override rules
      (circle-packed → background at any depth, not-yet-created → nonexistent, undefined value →
      neutral).
- [ ] `svgPatterns.calculateSvgPatterns` — one test that a fewer-than-`SVG_PARTITIONS` team
      result still produces a usable pattern, and that identical colour keys share a pattern id.
- [ ] `exportImport.ts` — one round-trip test (export a state, re-import it, assert equality)
      plus the version-rejection path. This is user-facing save/load with no coverage at all.
- [ ] `state.ts` `postprocessState` — one test per recompute trigger showing it _does_ and
      _does not_ fire; this is the performance-critical diffing CLAUDE.md says to preserve, and
      the refactor in phase 2 will lean on it.
- [ ] Review `nodeData.test.ts` (496 lines) for tests that restate each other. The
      `nodeChangersByTeam` block has six cases where three would document the rule; merge rather
      than delete outright, keeping the overlapping-teams and ignored-users cases, which are the
      ones carrying real logic.
- [ ] Fix the reference-vs-`_.isEqual` and redundant-check inconsistencies in `postprocessState`,
      and the hardcoded `4` in `exportImport.ts`, now that there are tests around them.

### 1.5 Close out phase 1

- [ ] `npm run check` clean; `npm run e2e` reviewed shot by shot, not just "passed".
- [ ] Fold anything durable into `CLAUDE.md` (the second Playwright project, the nested fixture
      the new pure module).

---

## Phase 2 — expressiveness refactor

Not planned in detail yet, by design. Candidates the survey surfaced, to be confirmed once
phase 1's tests exist:

- `nodeData.ts` (874 lines) is one flat namespace of ~50 `nodeXxx` functions over several
  unrelated concerns — git change details, coupling, layout, team aggregation. The team
  aggregation half is well tested and could move out cleanly.
- `state.ts` (986 lines) mixes the `Config` shape, the action union, the reducer and
  `postprocessState`'s derived-data cache in one file.
- `UsersAndTeams.tsx` (1348 lines) is the largest file in the repo and untouched by tests.
- `Viz.tsx` (966 lines) — phase 1.3 takes the first pure slice out; more should follow.

## Phase 3 — cleanup pass

- [ ] Re-review the suite after the refactor: tests that only made sense against the old shape
      get rewritten or dropped.
- [ ] Delete `spec.md` and `plan.md`, folding what lasts into `CLAUDE.md`.
