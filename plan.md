# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

**Parts 1-6 are done.** Git holds the detail — `4b71355`, `bdf07b2`, `02e77cf`, `8152876` for
Part 6. **Part 7, `Viz.tsx`, is all that is left**, then the close-out.

## Technical context

**Where things stand.** 247 unit tests across 22 files, plus 16 screenshots in two Playwright
projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The existing tests
are the safety net for everything below — they are not to be rewritten to match new behaviour.

Already split, for orientation — three folders following the same shape, a module per concern
with tests beside the ones that are pure:

- `src/model/` — `teamStats.ts` (456), `gitChanges.ts` (228), `nodeAccessors.ts` (117),
  `coupling.ts` (113), `couplingBuckets.ts` (39). `nodeData.ts` is gone.
- `src/state/` — `config.ts` (397), `reducer.ts` (189), `actions.ts` (168), `derived.ts` (131),
  `colours.ts` (25). `state.ts` keeps 147 lines of shared types and imports nothing from
  `state/` at runtime.
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

947 lines, untouched by Part 6, so every line number below is current as of `8152876`. One pure
slice is already out (`vizNodeSelection.ts`, imported at line 35).

**The shape of the file**, top level, in order:

| lines   | what                                                                    |
| ------- | ----------------------------------------------------------------------- |
| 69-125  | `redrawSelection`, `findSelectionPath` — the SVG selection outline      |
| 126-188 | `update` — the cheap redraw path                                        |
| 189-328 | `normalizedCouplingNodes`, `arcPath`, `drawCoupling`, `updateCoupling`  |
| 329-361 | `refitCamera`, `layoutSize`                                             |
| 362-496 | `draw` — the full rebuild                                               |
| 497-627 | `addUtcDays`, `drawTimescale` — the timescale chart and its brush       |
| 628-639 | `usePrevious`, `updateBodyTheme`                                        |
| 640-947 | the `Viz` component: refs, effects, zoom wiring, DPR watch, GL recovery |

`CLAUDE.md`'s test boundary applies throughout: `GlRenderer.ts` and `shaders.ts` are verified
manually and by the screenshot suite only, and nothing unit-tested may import `gl`. Whatever is
extracted here and _is_ pure gets tests; the imperative D3 shell stays in `Viz.tsx`.

### Step 7.1 — coupling arcs out

- [ ] `src/webgl/` is for GL; coupling arcs are SVG overlay geometry. `arcPath` (212),
      `normalizedCouplingNodes` (189) and the arc styling go to their own module, keeping the
      pure geometry separable from the D3 selection code. `drawCoupling` (227) and
      `updateCoupling` (306) are D3 selection code — decide whether they follow or stay.

**Verify:** `npm run check`; unit-test `arcPath` now it is reachable. Manual: **needs the
synthetic coupling fixture** described in the findings above — no tracked data file has a single
coupled pair, so there is nothing to look at otherwise. Build it, look at it, delete it.

### Step 7.2 — timescale brush out

- [ ] The timescale chart and its brush (497-627) are self-contained: extract them, keeping the
      pure date-to-scale mapping testable. `addUtcDays` and `scaleUtc` live here and are correct
      — move them unchanged.

**Verify:** `npm run e2e:strict` — the timescale is the bottom ~65px of the `.Viz` element, so it
is covered by shots 2-6 and every nested shot. It is _not_ in shots 1 and 10, which are viewport
shots at 1600x1000 and cut off above it. Clean means faithful.

### Step 7.3 — zoom and camera wiring out

- [ ] The `d3.zoom` setup (from ~452), the DPR watch (773) and the GL context-loss recovery
      (807-811) into their own module. `camera.ts` is already pure and tested; this is the
      imperative wiring around it.

**Verify:** `npm run e2e:strict` clean. Manual: pan, zoom, resize the window, and — for context
loss — the WebGL recovery path described in `CLAUDE.md`.

---

## Close out

- [ ] Confirm no file among the original four is over ~400 lines. Three already pass
      (`nodeData.ts` gone, `state.ts` 147, `UsersAndTeams.tsx` 199); `Viz.tsx` is the test.
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
