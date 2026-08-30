# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

**Parts 1-5 are done.** Git holds the detail; what a later step still needs is below.
**Part 6 is next.**

## Technical context

**Where things stand.** 187 unit tests across 18 files, plus 16 screenshots in two Playwright
projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The existing tests
are the safety net for everything below — they are not to be rewritten to match new behaviour.

The two files left to split:

| file                | lines |
| ------------------- | ----- |
| `UsersAndTeams.tsx` | 1348  |
| `Viz.tsx`           | 947   |

Already split, for orientation:

- `src/model/` — `teamStats.ts` (456), `gitChanges.ts` (228), `nodeAccessors.ts` (117),
  `coupling.ts` (113), `couplingBuckets.ts` (39), with `teamStats.test.ts` and `coupling.test.ts`
  beside them. `nodeData.ts` is gone.
- `src/state/` — `config.ts` (397), `reducer.ts` (189), `actions.ts` (168), `derived.ts` (131),
  `colours.ts` (25). `state.ts` keeps 147 lines of shared types, the `Message` constructors and
  the user-lookup helpers, and imports nothing from `state/` at runtime.

**Verification available to each step:**

| tool                                         | what it proves                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                              | typecheck, lint, format, 187 unit tests                               |
| `npm run e2e:strict`                         | all 16 screenshots at **zero** tolerance — the real regression signal |
| `npx playwright test --update-snapshots=all` | re-baseline, only ever with a stated reason (see below)               |

**The zero-tolerance rule.** A pure refactor must produce zero screenshot diffs. Every step of
Parts 1-5 that should have been invisible was. If a step that should be behaviour-preserving
shows a diff, that is a bug found, not a baseline to update.

**Re-baselining, when a diff is genuinely intended.** Do not use `npm run e2e:update` — the 2%
tolerance means it can report "10 passed" and rewrite nothing, leaving a stale baseline in place.
Use `npx playwright test --update-snapshots=all`, then `npm run e2e:strict` to prove the
baselines actually moved. Before updating anything, work out _which pixels_ changed and satisfy
yourself the change is the intended one.

## Techniques that have earned their keep

These are what made Parts 3-5 safe; reuse them rather than reinventing.

- **Prove a move was verbatim by diffing line multisets.** After extracting, run the old file
  through `git show HEAD:<path>`, strip imports and blanks from both sides, `sort` each, and
  `diff`. Every remaining difference should be a comment you wrote or an `export` keyword you
  added. This caught nothing wrong in five steps, which is exactly the point — it turns "I think
  I moved it faithfully" into a fact, in about ten seconds.
- **Prove a new test discriminates.** Neuter the production code the test covers (a `sed` on the
  check, or `git stash push -q` on the whole file), confirm the test fails, restore. A test that
  passes either way is not a test.
- **Prove a compile-time guarantee survived a move.** Step 5.2 deleted one reducer `case` and
  confirmed `Type 'SetDepth' is not assignable to type 'never'` before restoring it.
- **Temporary cross-module imports are fine if signposted.** Steps 4.1 and 5.1 each left one
  import pointing at the old home with a comment naming the step that would close it; 4.2 and 5.3
  closed them. Better than contorting the order to avoid a two-commit-long tie.
- **`@testing-library/react` is in use** (`ErrorBoundary.test.tsx`, `Loader.test.tsx`), so Part 6
  extends an existing pattern rather than inventing one. Both render a real component and assert
  on visible outcomes; `Loader.test.tsx` also drives one with a stubbed `fetch`.
- **A React error boundary wraps `App`**, and `index.tsx` registers global `error` /
  `unhandledrejection` handlers, so a component that throws mid-refactor shows its message and
  component stack instead of blanking the page.
- **`vi.stubEnv("TZ", …)` works in-process** for timezone-dependent tests; Node re-reads `TZ` on
  assignment.

## Findings from Parts 3-5 that later steps must not rediscover

- **No tracked data file can render a coupling arc.** `default.json` has the coupling feature on
  and 14 buckets, but _every_ `coupled_files` list in it is empty; `nested.json` has coupling off
  entirely. Step 4.3 verified the arcs against a synthetic fixture instead — `default.json` with
  real `coupled_files` written into four nodes, loaded via `EXPLORER_DATA`, then deleted.
  **Step 7.1 needs the same fixture**; budget for building it rather than discovering the gap
  again. This also sharpens `CLAUDE.md`'s "regenerate `default.json`" follow-up: the shipped
  sample cannot demonstrate coupling at all, and neither can any test.
- **Import cycles are a real hazard when splitting a hub module.** Part 5 hit one that the plan
  had not anticipated (see `spec.md`). Before choosing where a function lands, check what it
  calls and what calls it; a small leaf module is a cheap fix, and a type-only import is not an
  edge at all.
- **`nodeAge` treats day 0 as absent** (`if (!lastDay)`), noted in a comment at
  `model/gitChanges.ts` and deliberately not fixed.

---

## Part 6 — `UsersAndTeams.tsx` → `src/teams/`

Tests before anything moves. This is the riskiest part of the plan and the only file with no
coverage at all: 1348 lines, of which the `UsersAndTeams` component itself is one function from
line 129 to the end. `sortUsers` (line 81) and the `UsersAndTeamsPageState` type (line 47) are
already outside it.

Related components that will likely want to move too, or at least be considered: `EditAlias.tsx`
drives alias creation against the same page state, and `UserTeamList.tsx` renders team membership.

### Step 6.1 — whole-panel tests

- [ ] Follow the `@testing-library/react` pattern (`ErrorBoundary.test.tsx`, `Loader.test.tsx`):
      render the real panel against a `minimalState`, assert on **dispatched actions** rather
      than markup so the tests survive the restructure.
- [ ] Cover: create a team, assign users to it, create an alias, ignore a user, filter the user
      list, sort by a column.
- [ ] Check `index.tsx`'s missing `React.StrictMode` does not bite — this component is ordinary
      React, but confirm rather than assume.

**Verify:** the new tests are the verification, and each must be shown to discriminate. No
production change, so `npm run e2e:strict` must be clean.

### Step 6.2 — pure logic out

- [ ] `src/teams/` gets the non-React parts: `sortUsers`, filtering, `usersAndTeamsToPageFormat`,
      the page-state shape and its transitions.
- [ ] Unit-test them directly now they are reachable.

**Verify:** step 6.1's tests pass unchanged — that is the proof the extraction was faithful.

### Step 6.3 — split the component

- [ ] Break the remaining markup into components per section: the teams table, the ignored-users
      table, the users table, the import/export controls.
- [ ] This is where the "UI change is permitted, not sought" rule earns its keep: if some
      behaviour forces an ugly structure, change it deliberately and note it in the commit.

**Verify:** step 6.1's tests pass. `npm run e2e:strict` — shots 8 and 9 cover the Colours and
Lines panel, not this one, so expect clean; any diff means something moved that should not have.
Manual: open the panel and exercise each table by hand.

---

## Part 7 — `Viz.tsx`

One pure slice is already out (`vizNodeSelection.ts`, imported at `Viz.tsx:35`).

### Step 7.1 — coupling arcs out

- [ ] `src/webgl/` is for GL; coupling arcs are SVG overlay geometry. `arcPath` (line 212),
      `normalizedCouplingNodes` (line 189) and the arc styling go to their own module, keeping
      the pure geometry separable from the D3 selection code.

**Verify:** `npm run check`; unit-test `arcPath` now it is reachable. Manual: **needs the
synthetic coupling fixture** described in the findings above — no tracked data file has a single
coupled pair, so there is nothing to look at otherwise.

### Step 7.2 — timescale brush out

- [ ] The timescale chart and its brush are self-contained: extract them, keeping the pure
      date-to-scale mapping testable. `addUtcDays` and `scaleUtc` live here and are correct —
      move them unchanged.

**Verify:** `npm run e2e:strict` — the timescale is the bottom ~65px of the `.Viz` element, so it
is covered by shots 2-6 and every nested shot. It is _not_ in shots 1 and 10, which are viewport
shots at 1600x1000 and cut off above it. Clean means faithful.

### Step 7.3 — zoom and camera wiring out

- [ ] The `d3.zoom` setup, DPR watching and GL context-loss recovery into their own module.
      `camera.ts` is already pure and tested; this is the imperative wiring around it.

**Verify:** `npm run e2e:strict` clean. Manual: pan, zoom, resize the window, and — for context
loss — the WebGL recovery path described in `CLAUDE.md`.

---

## Close out

- [ ] Confirm no file among the original four is over ~400 lines. Two already pass
      (`nodeData.ts` gone, `state.ts` 147); `UsersAndTeams.tsx` and `Viz.tsx` are the test.
- [ ] Update `CLAUDE.md`'s architecture section to describe the new layout, replacing the
      file-by-file descriptions this work invalidates — `nodeData.ts` and `state.ts` are
      described there as they no longer are.
- [ ] `npm run check` and `npm run e2e:strict` green from a clean checkout.
- [ ] Delete `spec.md` and `plan.md`; git keeps the history.

## Known risks

- **Import churn.** Moving modules touches many files' import lists. `simple-import-sort` fixes
  ordering automatically (`npm run lint:fix`), so the churn is noise rather than work — but it
  makes diffs large, and a real change can hide in one. Keep each step to a single concern, and
  use the multiset diff above to prove nothing hid.
- **`UsersAndTeams.tsx` is one 1200-line function.** Step 6.1 exists precisely because moving it
  blind is the riskiest thing left. If those tests turn out to be hard to write, that is
  information — stop and reconsider the split before continuing.
- **Screenshot coverage is uneven.** The Users and Teams panel has none, so step 6.3 leans on a
  manual check; coupling arcs have none _and_ no data to render, so step 7.1 needs a synthetic
  fixture. Consider adding shots for either if the manual check proves fiddly.
- **A plan step's stated premise can be wrong.** This has now happened twice: step 1.2 was
  written around a file that turned out to load fine, and step 4.3's manual check assumed
  `default.json` could show coupling. Check a step's factual claims before building on them, and
  correct `spec.md` when one does not hold.
