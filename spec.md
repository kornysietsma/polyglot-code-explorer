# Test clarity and expressiveness — spec

## Why

Two goals, in this order:

1. **Cover nested circle packing.** `nestedCircles` is a layout Korny uses often, and it is the
   awkward one — circle depth varies per branch, and the outline/level logic exists almost
   entirely to serve it. Today no screenshot test renders it at all: `data/default.json` is a
   `circlePack` root, so the whole e2e suite exercises one circle at the top and voronoi below.
   The one regression CLAUDE.md records for this area ("a circle full of packed circles has
   nothing tiling its boundary, so dropping those nodes makes the group's circle vanish") is
   invisible to CI-equivalent checks.
2. **Make the test suite say what the code does.** The next piece of work is an expressiveness
   refactor. Tests are the safety net for that, so before refactoring they need to (a) pin the
   behaviour that is genuinely risky, and (b) read as documentation. Right now coverage is
   lopsided: the WebGL layer is well covered, and `nodeData.ts`'s team aggregation is well
   covered, but several pure modules with real edge cases have no tests, and a handful of them
   have confirmed defects.

The end state is _enough_ tests to verify risky logic and document behaviour — not a test per
function.

## What "enough" means here

- Prefer one expressive test over a module's real behaviour to five tests over its internals.
- A test earns its place if it would catch a plausible regression, or if reading it tells you
  something the code does not say plainly.
- Deleting or merging tests that do neither is part of the work, not a failure of it.

## Confirmed defects found during the survey

All verified by running the code, not read off. Each gets a test that fails first.

| #   | Where                              | Defect                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `nodeData.ts` `commonRoots`        | Overcounts by 1 when both paths are identical (`"a/b/c/d"` vs itself → 5, not 4). The `while` loop compares `undefined === undefined` past the end of both arrays before the `index >= maxLength` break fires. Feeds `nodeCouplingFilesFiltered`'s "max common roots" filter. |
| 2   | `preprocess.ts` `gatherNodeStats`  | `gitData?.details?.length ?? 0 > 0` parses as `length ?? (0 > 0)` — `??` binds looser than `>`. Currently harmless (a `0` length is falsy either way) but the guard does not mean what it reads as, and the `days.length == 0` throw below it is unreachable.                 |
| 3   | `preprocess.ts` `gatherNodeStats`  | `days.sort()` is the default **lexicographic** sort on unix timestamps. Correct today only because every timestamp is 10 digits; wrong for any other magnitude. Drives the global earliest/latest date range.                                                                 |
| 4   | `preprocess.ts` `stripTabs`        | `text.replace("\t", "<tab>")` replaces only the _first_ tab. The function exists specifically so `"name\temail"` is a safe map key — a two-tab name still yields a tab and can collide.                                                                                       |
| 5   | `datetimes.ts` `humanizeDays`      | Boundaries are `>` where they should be `>=`: 365 days renders "52 weeks, 1 day", 7 days renders "7 days". `humanizeDays(0)` returns `""`. User-visible in the age inspector.                                                                                                 |
| 6   | `preprocess.ts` `addTimescaleData` | The `file_stats` branch keys buckets on the raw `modified` timestamp instead of `startOfUnit(...)`, so a non-git data file gets one timescale bucket per distinct mtime rather than one per week. Rare — most data files have git — but real.                                 |

## Non-defects worth pinning with a test rather than changing

- `BaseVisualization.overrideColourFunction` paints _every_ circle-packed node with
  `circlePackBackground`, at any nesting depth — deliberate (children paint over it), but
  surprising, and it is what makes nested circles legible.
- `topTeamsPartitioned` can return fewer entries than `partitions`, so a striped pattern can be
  built from 2 colours when `SVG_PARTITIONS` is 3.
- `findMaxima` sets `maxima.files = 1` unconditionally — "files" maxima is per-file, not a count.
- `outlineLevel`'s split by kind (every circle at level 0, voronoi-inside-a-circle from level 1).
  Already tested; the nested screenshots make it visible too.

## Inconsistencies to clean up (no behaviour change)

- `postprocessState` compares `themedColours(...).teams` by reference (`!=`) while every other
  check in the same function uses `_.isEqual`. Over-recomputes rather than under-recomputes, so
  it is a clarity bug, not a correctness one. The adjacent `showNonTeamChanges` check is
  redundant — already covered by the `_.isEqual(teamVisualisation)` above it.
- `postprocessState`'s file-maxima block writes into `resultingState.calculated` relying on an
  earlier block having cloned (its `datesChanged` condition happens to imply the first block's).
  Safe today, coupled by accident.
- `exportImport.ts`'s `padNestedStrokes`/`padNestedWidths` hardcode `4`, which CLAUDE.md says
  should come from `NESTED_LEVEL_COUNT`.

## Testability refactors this implies

Small and local — this is _not_ the expressiveness refactor, just what the tests need.

- **`Viz.tsx`'s visible/outline node selection.** The two `rootNode.descendants().filter(...)`
  chains in `draw()` decide which nodes get a fill and which get an outline, including the rule
  that keeps circle-packed nodes in the outline set. That is exactly the logic the vanishing-
  circle regression lives in, and it is pure — but it is buried in a 966-line imperative D3
  function that jsdom cannot run. Extract to a pure module (`vizNodeSelection.ts` or similar,
  alongside `vizUpdatePaths.ts`) and unit-test against a nested fixture tree.
- **`preprocess.ts`'s week bucketing.** Already pure; just needs tests.

## Nested-circles e2e fixture

`data/nested.json`, committed: `omf.json` pruned to the `nesteda` and `nestedc` circle-packed
groups plus two plain voronoi siblings (`qclib`, `tac`), capped at 5 children per directory but
otherwise left at its natural depth of 13. 367 KB, 217 nodes, 124 files — half the size of the
746 KB `default.json`. It is real scanner output apart from the nesting arrangement, which was
hand-built to match what `packChildren` produces (as CLAUDE.md already records for `omf.json`).

Its 35 contributors are **anonymised** — omf.json is an open-source project, but its committers
are real people who did not agree to appear in this repo. Every reference to a user in the data
is by numeric id, so replacing `metadata.git.users` with random alphanumeric names and
`@example.com` addresses anonymises the whole file while keeping the tree resolvable. The only
identifying strings left are the project's own public `git@github.com:openmainframeproject/...`
remote URLs.

The pruning was a one-off, done with a throwaway script rather than a committed one — the fixture
is a golden file that should not need rebuilding, and a build script for it would be maintenance
with no reader.

`default.json` stays as it is. Making the _shipped_ sample `nestedCircles` needs a fresh scanner
plus layout run, which lives outside this repo; that remains the existing follow-up.

The e2e suite grows a second Playwright project against a second dev server on port 5174 with
`EXPLORER_DATA=explorernested`, so the two datasets keep separate baselines and the app gains no
test-only code path.
