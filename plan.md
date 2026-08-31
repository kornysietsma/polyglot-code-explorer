# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

**Parts 1-6 are done.** Git holds the detail — `4b71355`, `bdf07b2`, `02e77cf`, `8152876` for
Part 6. **Part 7 is done** — steps 7.1, 7.2 and 7.3 — and only the close-out is left.

## Technical context

**Where things stand.** 279 unit tests across 25 files, plus 16 screenshots in two Playwright
projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The existing tests
are the safety net for everything below — they are not to be rewritten to match new behaviour.

Already split, for orientation — four folders following the same shape, a module per concern
with tests beside the ones that are pure:

- `src/model/` — `teamStats.ts` (456), `gitChanges.ts` (228), `nodeAccessors.ts` (117),
  `coupling.ts` (113), `couplingBuckets.ts` (39). `nodeData.ts` is gone.
- `src/state/` — `config.ts` (397), `reducer.ts` (189), `actions.ts` (168), `derived.ts` (131),
  `colours.ts` (25). `state.ts` keeps 147 lines of shared types and imports nothing from
  `state/` at runtime.
- `src/viz/` — `cameraWiring.ts` (208), `couplingArcs.ts` (169), `timescale.ts` (183),
  `vizRefs.ts` (28), with their tests beside them.
- `src/teams/` — logic: `pageStateEdits.ts` (328), `pageState.ts` (229), `importExport.ts` (166),
  `userList.ts` (109), `colourSchemes.ts` (52). Components: `UsersTable.tsx` (219),
  `TeamsTable.tsx` (185), `ImportExportControls.tsx` (144), `IgnoredUsersTable.tsx` (71),
  `UsersAndTeamsHelp.tsx` (69). `UsersAndTeams.tsx` is 199 lines of modal shell.
  `EditAlias.tsx` (356) is the one part of the panel Part 6 did not restructure.

**Verification available to each step:**

| tool                                         | what it proves                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                              | typecheck, lint, format, 247 unit tests                               |
| `npm run e2e:strict`                         | all 16 screenshots at **zero** tolerance — the real regression signal |
| `npx playwright test --update-snapshots=all` | re-baseline, only ever with a stated reason (see below)               |

**The zero-tolerance rule.** A pure refactor must produce zero screenshot diffs. Every step of
Parts 1-6 that should have been invisible was. If a step that should be behaviour-preserving
shows a diff, that is a bug found, not a baseline to update.

**Re-baselining, when a diff is genuinely intended.** Do not use `npm run e2e:update` — the 2%
tolerance means it can report "10 passed" and rewrite nothing, leaving a stale baseline in place.
Use `npx playwright test --update-snapshots=all`, then `npm run e2e:strict` to prove the
baselines actually moved. Before updating anything, work out _which pixels_ changed and satisfy
yourself the change is the intended one.

## Techniques that have earned their keep

These are what made Parts 3-6 safe; reuse them rather than reinventing.

- **Prove a move was verbatim by diffing line multisets.** After extracting, run the old file
  through `git show HEAD:<path>`, strip imports and blanks from both sides, `sort` each, and
  `diff`. Every remaining difference should be something you can name: a comment you wrote, an
  `export` you added, a signature that gained a parameter, or prettier rejoining a line at its
  new indentation. It turns "I think I moved it faithfully" into a fact, in about ten seconds.
  Where prettier has reflowed _prose_ (JSX text at a new indentation), diff the words instead —
  `tr -s ' \n' '\n\n' | sort` — since line-level noise swamps the signal there.
- **Prove a new test discriminates.** Neuter the production code the test covers (a `sed` on the
  check, or `git stash push -q` on the whole file), confirm the test fails, restore. A test that
  passes either way is not a test. For a bug fix, write the test _first_ and watch it fail.
- **Prove a compile-time guarantee survived a move.** Step 5.2 deleted one reducer `case` and
  confirmed `Type 'SetDepth' is not assignable to type 'never'` before restoring it.
- **Temporary cross-module imports are fine if signposted.** Steps 4.1 and 5.1 each left one
  import pointing at the old home with a comment naming the step that would close it; 4.2 and 5.3
  closed them. Better than contorting the order to avoid a two-commit-long tie.
- **Check a claim about pre-existing behaviour by checking the commit out.** Step 6.4's bug was
  confirmed pre-existing with `git stash push -u`, `git checkout 4b71355`, reproducing it in the
  browser, then coming back. The dev server hot-reloads and `node_modules` is shared, so it costs
  about a minute — much better than arguing from the code.
- **`@testing-library/react` is in use** — `ErrorBoundary.test.tsx`, `Loader.test.tsx` and
  `UsersAndTeams.test.tsx`, the last of which drives a whole modal through the DOM. Two gotchas
  it had to solve, should a Part 7 test ever need a modal: react-modal hides the app element
  while open and Testing Library's role queries skip `aria-hidden`, so render into a container
  registered with `ReactModal.setAppElement`; and `onAfterOpen` fires from a
  `requestAnimationFrame`, so `await` before reading anything it seeded.
- **A React error boundary wraps `App`**, and `index.tsx` registers global `error` /
  `unhandledrejection` handlers, so a component that throws mid-refactor shows its message and
  component stack instead of blanking the page.
- **`vi.stubEnv("TZ", …)` works in-process** for timezone-dependent tests; Node re-reads `TZ` on
  assignment.
- **For a manual check, drive the real app with `playwright-cli`** (per `CLAUDE.md`). Start
  `npm start`, then reach elements with `--raw eval` where a snapshot ref is awkward. This is how
  step 6.3 exercised the panel no screenshot covers, and how step 6.4's bug was found — Part 7's
  steps lean on it just as heavily.

## Findings that Part 7 must not rediscover

- **No tracked data file can render a coupling arc.** `default.json` has the coupling feature on
  and 14 buckets, but _every_ `coupled_files` list in it is empty; `nested.json` has coupling off
  entirely. Step 4.3 verified the arcs against a synthetic fixture instead — `default.json` with
  real `coupled_files` written into four nodes, loaded via `EXPLORER_DATA`, then deleted.
  **Step 7.1 needs the same fixture**; budget for building it rather than discovering the gap
  again. This also sharpens `CLAUDE.md`'s "regenerate `default.json`" follow-up: the shipped
  sample cannot demonstrate coupling at all, and neither can any test.
- **Import cycles are a real hazard when splitting a hub module.** Part 5 hit one the plan had
  not anticipated (see `spec.md`). Before choosing where a function lands, check what it calls
  and what calls it; a small leaf module is a cheap fix, and a type-only import is not an edge
  at all.
- **`nodeAge` treats day 0 as absent** (`if (!lastDay)`), noted in a comment at
  `model/gitChanges.ts` and deliberately not fixed.
- **Part 6 found and fixed three defects, each with a test.** Two were the same mistake twice —
  a `<label htmlFor>` pointing at a sibling's input, so one field had two labels and another had
  none. Worth a glance for that pattern anywhere Part 7 touches a labelled control.

---

## Part 7 — `Viz.tsx`

503 lines with Part 7 done, and the line numbers below are current. Two pure slices were already
out before Part 7 started (`vizNodeSelection.ts`, `vizUpdatePaths.ts`, both still at the top
level); the coupling arcs, the timescale and the camera wiring are now out too, in `src/viz/`.

**The shape of the file**, top level, in order:

| lines   | what                                                               |
| ------- | ------------------------------------------------------------------ |
| 36-92   | `redrawSelection`, `findSelectionPath` — the SVG selection outline |
| 93-154  | `update` — the cheap redraw path                                   |
| 155-248 | `draw` — the full rebuild                                          |
| 249-260 | `usePrevious`, `updateBodyTheme`                                   |
| 261-503 | the `Viz` component: refs, effects, tooltip, click and hover       |

`CLAUDE.md`'s test boundary applies throughout: `GlRenderer.ts` and `shaders.ts` are verified
manually and by the screenshot suite only, and nothing unit-tested may import `gl`. Whatever is
extracted here and _is_ pure gets tests; the imperative D3 shell stays in `Viz.tsx`.

### Step 7.1 — coupling arcs out — **done**

- [x] The whole coupling concern is now `src/viz/couplingArcs.ts` (169 lines) with
      `couplingArcs.test.ts` (16 tests) beside it. `drawCoupling` and `updateCoupling` followed
      the pure geometry out rather than staying: the module owns "coupling arcs on the SVG
      overlay" end to end, and `Viz.tsx` keeps only two call sites. `Viz.tsx` 947 → 812.

**Two decisions taken with Korny.** A new `src/viz/` folder, per the spec's "new feature folders"
agreement, rather than another top-level `viz*` module — steps 7.2 and 7.3 land there too. The
existing `vizNodeSelection.ts` and `vizUpdatePaths.ts` were **left where they are**, to keep this
step to one concern; moving them in is a natural tidy-up for 7.3 or the close-out.

**What moved and what changed.** The line-multiset diff left only nameable differences: seven
declarations gained `export`; the four arrow consts inside `drawCoupling` became module-level
functions (`couplingArcPath`, `couplingArcStroke`, `couplingArcWidth`, `couplingArcLabel`), so
their `d` parameter is now `link` and `nodesByPath`/`config` are explicit arguments; and
`updateCoupling` takes `overlaySvg: SVGSVGElement | null` instead of `Viz.tsx`'s whole `VizRefs`
bundle — it only ever used that one ref, and depending on the bundle would have made the module
import `Viz.tsx`. One dead commented-out line (`// return \`${line()([sourcePos, targetPos])}\``)
was dropped. Nothing else.

**The synthetic fixture, so it need not be reinvented.** `jq` over `data/default.json`, writing
`coupled_files` into the first bucket of four of the fourteen files that already carry (empty)
coupling data, saved as `data/couplingtest.json` and loaded with `EXPLORER_DATA=couplingtest`:

| source                               | target                        | ratio | width |
| ------------------------------------ | ----------------------------- | ----- | ----- |
| `explorer/src/UsersAndTeams.tsx`     | `explorer/src/state.ts`       | 0.950 | 3px   |
| `explorer/src/UsersAndTeams.tsx`     | `explorer/src/Controller.tsx` | 0.850 | 2px   |
| `explorer/src/VisualizationData.tsx` | `scanner/src/main.rs`         | 0.917 | 2px   |
| `scanner/src/main.rs`                | `scanner/src/git_logger.rs`   | 1.000 | 3px   |
| `scanner/src/main.rs`                | `explorer/src/state.ts`       | 0.963 | 3px   |
| `scanner/src/flare.rs`               | `scanner/src/loc.rs`          | 0.588 | 1px   |

Two things to know if it is rebuilt. The **scanner** files' coupling buckets are the 2019 window
and the **explorer** files' are the 2022 one, so only the explorer-sourced rows render inside the
default date range — the last three need the date brush widened. And a ratio under the default
`minRatio` of 0.9 only appears once the Coupling Ratio slider is lowered, which is what makes the
0.850 and 0.588 rows worth having.

**Verified.** `npm run check` green (263 tests, up from 247). All sixteen unit tests were shown to
discriminate by neutering the code each covers — the `shown` flag, the sweep flag, each width
threshold, the opacity, the label's precision, the missing-target throw, each filter argument, and
the date range being read from `config.filters` rather than `couplingConfig`. Manually, against
the fixture: the arcs render with the right `d`, opacity, width, arrowhead and `<title>`; lowering
the ratio slider adds the weaker ones; the distance filter drops the two same-repo arcs and keeps
the cross-repo one, proving the `exit().remove()` path; and clicking an arc selects its **source**
node. Strongest check: with `git stash push -- src/Viz.tsx` to restore the old code, the same
three arcs' `d`, stroke, width, marker, fill, vector-effect and title came back **byte-identical**.
`npm run e2e:strict` 16/16 clean, as expected — no tracked data file draws an arc.

### Step 7.2 — timescale brush out — **done**

- [x] The chart and its brush are now `src/viz/timescale.ts` (183 lines) with `timescale.test.ts`
      (11 tests) beside it. `Viz.tsx` 812 → 668.

**Three pure functions came out of `drawTimescale`'s body**, which is where the testable part of
this turned out to be — the plan's "pure date-to-scale mapping" is really three separate things:

- `timescaleValueFn(features)` — commits, or files modified when the scan has no git data.
- `timescaleDomain(data)` — the data's span padded a week each side, throwing on empty.
- `brushedDateRange(selection, xScale, earliest, latest)` — what a finished drag means in unix
  time, or `undefined` when it means nothing. This is the one worth having a name: `brush.move`
  re-applies the current range on every redraw and that fires `"end"` too, so "the selection
  equals the range already in state" is the common case, not an edge one, and dispatching it
  would loop. It was an inline `if` before, easy to miss.

`addUtcDays` moved unchanged and is now exported and tested, `scaleUtc` with it. `margin` stayed
inside `drawTimescale` where it was — nothing else uses it, and hoisting it would have been an
improvement nobody asked for.

**Verified.** `npm run check` green (274 tests). All 11 tests shown to discriminate: calendar
arithmetic in `addUtcDays` (fails only across a DST boundary, which is the point), mutating its
argument, `valueFn` ignoring the git flag, the domain padding, the empty-data throw, and the
unchanged-range guard both removed and widened to `||`. `npm run e2e:strict` 16/16 clean.

Manually, since no screenshot drags the brush: dragging sets a new date range, the brush stays
where it was dropped rather than snapping back, and one drag produces **exactly one** redraw — the
`brush.move` that follows it does not dispatch again. And with `git stash push -- src/Viz.tsx` to
restore the old code, `svg.timescale`'s serialised markup came back **byte-identical**.

### Step 7.3 — zoom and camera wiring out — **done**

- [x] `src/viz/cameraWiring.ts` (208 lines) holds `layoutSize`, `refitCamera`, `attachZoom`,
      `watchViewport` and `watchContextLoss`, with `cameraWiring.test.ts` beside it. `Viz.tsx`
      668 → 503.

**`VizRefs` moved too, to its own `src/viz/vizRefs.ts` (28 lines).** It is the one type `Viz.tsx`
and `cameraWiring.ts` both need — `refitCamera` and both watchers take it, and narrowing them to
subsets would just have re-declared it under another name. A leaf module means neither file has to
import the other to name the bundle, the same trick `state/colours.ts` used in Part 5.

**The two `useEffect` bodies became plain functions returning their own teardown**, so the effects
in `Viz.tsx` are now one line each: `useEffect(() => watchViewport(refs, dataRef), [...])`. The
dependency arrays stayed in `Viz.tsx`, where React can see them.

**`attachZoom` is generic in the overlay group's datum** — all it does with that group is set a
transform, and `draw()` types it by the coupling links it also carries. It re-reads `glCanvas` and
`glRenderer` from the refs and guards on them, rather than taking two more parameters; the guard
cannot fire from `draw()`, and matches how `refitCamera` right above it already behaves.

**Verified.** `npm run check` green (279 tests); the five `layoutSize` tests discriminate against
a default instead of a throw, an `undefined`-only guard that lets zero through, and swapped
dimensions. `npm run e2e:strict` 16/16 clean.

By hand, since none of this has screenshot coverage: dragging pans (the `__zoom` transform and the
overlay group's compensating transform move together), double-click zooms to k=2 and the overlay
scales to match, forcing the chart-stack to 700x500 makes the canvas's backing store follow while
**keeping** the user's zoom, and `WEBGL_lose_context` produces "context lost" then "rebuilding
renderer" on restore, after which the canvas draws normally again. And with
`git stash push -- src/Viz.tsx`, the same scripted pan-then-double-click produced a **byte-identical**
zoom transform, overlay transform, canvas backing size and overlay viewBox.

**`Viz.tsx` is 503 lines, over the ~400 the close-out asks for** — a decision for the close-out,
not a step. What is left is `redrawSelection`/`findSelectionPath` (36-92), `update` (93-154),
`draw` (155-248) and the component itself (261-503). The obvious next slice is the selection
outline, ~60 lines, which would land it near 445.

## Close out

- [ ] **Decide what to do about `Viz.tsx` at 503 lines.** Three of the four pass (`nodeData.ts`
      gone, `state.ts` 147, `UsersAndTeams.tsx` 199); `Viz.tsx` is over. Either accept it as the
      irreducible imperative shell, or take one more slice — the selection outline (36-92) is the
      obvious ~60 lines, landing it near 445. Korny's call.
- [ ] Update `CLAUDE.md`'s architecture section to describe the new layout, replacing the
      file-by-file descriptions this work invalidates. Specifically: `nodeData.ts` and `state.ts`
      are described there as they no longer are; `UsersAndTeams.tsx` is named as the home of
      state import/export and should point at `src/teams/`; and whatever Part 7 lands wants its
      own lines beside the `src/webgl/` section.
- [ ] `npm run check` and `npm run e2e:strict` green from a clean checkout.
- [ ] Delete `spec.md` and `plan.md`; git keeps the history.

## Known risks

- **Import churn.** Moving modules touches many files' import lists. `simple-import-sort` fixes
  ordering automatically (`npm run lint:fix`), so the churn is noise rather than work — but it
  makes diffs large, and a real change can hide in one. Keep each step to a single concern, and
  use the multiset diff above to prove nothing hid.
- **`Viz.tsx` is the least testable file in the repo.** Imperative D3 against a WebGL canvas, and
  jsdom has no GL context, so the screenshot suite and manual checks carry nearly all the weight.
  Extract the pure parts and test those; do not reach for a WebGL mock, which `CLAUDE.md` rules
  out deliberately.
- **Screenshot coverage is uneven.** Coupling arcs have none _and_ no data to render, so step 7.1
  needs a synthetic fixture and a manual look. Consider adding a shot if that proves fiddly.
- **A plan step's stated premise can be wrong.** This has now happened twice: step 1.2 was
  written around a file that turned out to load fine, and step 4.3's manual check assumed
  `default.json` could show coupling. Check a step's factual claims before building on them, and
  correct `spec.md` when one does not hold.
