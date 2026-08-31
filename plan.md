# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

**Parts 1-5 are done, and so are steps 6.1 and 6.2.** Git holds the detail; what a later step still needs
is below. **Step 6.3 is next.**

## Technical context

**Where things stand.** 244 unit tests across 22 files, plus 16 screenshots in two Playwright
projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The existing tests
are the safety net for everything below — they are not to be rewritten to match new behaviour.

The files left to split:

| file                | lines | what is left                                          |
| ------------------- | ----- | ----------------------------------------------------- |
| `UsersAndTeams.tsx` | 923   | one component: the JSX, the import/export, the wiring |
| `Viz.tsx`           | 947   | all of it                                             |

Already split, for orientation:

- `src/model/` — `teamStats.ts` (456), `gitChanges.ts` (228), `nodeAccessors.ts` (117),
  `coupling.ts` (113), `couplingBuckets.ts` (39), with `teamStats.test.ts` and `coupling.test.ts`
  beside them. `nodeData.ts` is gone.
- `src/state/` — `config.ts` (397), `reducer.ts` (189), `actions.ts` (168), `derived.ts` (131),
  `colours.ts` (25). `state.ts` keeps 147 lines of shared types, the `Message` constructors and
  the user-lookup helpers, and imports nothing from `state/` at runtime.
- `src/teams/` — `pageStateEdits.ts` (328), `pageState.ts` (196), `userList.ts` (109),
  `colourSchemes.ts` (52), each with its tests beside it. `EditAlias.tsx` now takes the page
  state type from `teams/pageState` rather than from the component.

**Verification available to each step:**

| tool                                         | what it proves                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                              | typecheck, lint, format, 244 unit tests                               |
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
- **Two latent defects in the users panel, found while writing step 6.1's tests.** Step 6.1 left
  both alone, since it was a no-production-change step, and its tests pin the current behaviour.
  Korny has since decided both are to be fixed, each in the step that is touching that code
  anyway — so each is a deliberate behaviour change, noted in its commit, with a step 6.1 test
  updated alongside it. Those are the only two test edits Part 6 is allowed; any other test that
  has to change is still the signal that the restructure was not faithful.
  - **Fixed in step 6.2:** the user filter never lower-cased the query although it lower-cased
    the name and email it compared against, so any capital letter typed into the filter box
    matched nothing. Now in `teams/userList.ts`'s `userIsVisible`, with a comment.
  - **Fix in step 6.3:** `EditAlias.tsx`'s Email label carries `htmlFor={aliasNameId}` — the
    _name_ input's id — so both labels point at the same input and the email field has no label
    at all. This is why the alias test currently reaches those two inputs by role and order
    rather than by label text.
- **react-modal calls `onAfterOpen` from a `requestAnimationFrame`**, so a test that opens the
  alias modal has to `await` before the modal's seeded state is there. `EditAlias` is the only
  user of `onAfterOpen`.

---

## Part 6 — `UsersAndTeams.tsx` → `src/teams/`

Tests before anything moves. This is the riskiest part of the plan and the only file with no
coverage at all: 1348 lines, of which the `UsersAndTeams` component itself was one function from
line 129 to the end. `sortUsers` (line 81) and the `UsersAndTeamsPageState` type (line 47) are
already outside it.

Related components that will likely want to move too, or at least be considered: `EditAlias.tsx`
drives alias creation against the same page state, and `UserTeamList.tsx` renders team membership.

### Step 6.1 — whole-panel tests — **done**

- [x] Follow the `@testing-library/react` pattern (`ErrorBoundary.test.tsx`, `Loader.test.tsx`):
      render the real panel against a `minimalState`, assert on **dispatched actions** rather
      than markup so the tests survive the restructure.
- [x] Cover: create a team, assign users to it, create an alias, ignore a user, filter the user
      list, sort by a column.
- [x] Check `index.tsx`'s missing `React.StrictMode` does not bite — this component is ordinary
      React, but confirm rather than assume. It does not: the panel produces the same action
      under `<StrictMode>`, and there is now a test saying so.

`src/UsersAndTeams.test.tsx`, 9 tests. The panel dispatches exactly one action,
`setUserTeamAliasData`, and only on "save and close" — so seven of the nine drive the DOM and
assert on that payload and nothing else. Filtering and sorting dispatch nothing, so those two
read the users table's Name column; that is the only markup any of these tests depend on. The
fixture gives three users stats that rank them differently in every sortable column, so a sort
assertion cannot pass by coincidence.

Two things the tests had to work around are recorded under the findings above: react-modal's
`onAfterOpen` fires a frame late, and `EditAlias`'s email input has no working label.

**Verified:** all nine shown to discriminate, by mutating the production code each one covers —
nine mutations in all: `newTeam`'s `set`, its single-user naming, `addUsersToTeam`,
`removeUsersFromTeam`, `EditAlias`'s `addAlias`, `ignoreCheckedUsers`, `filterUsers`,
`sortUsers`' comparator, and `cancel` wired to `save`. `npm run check` green;
`npm run e2e:strict` 16/16 clean, as it must be with no production change.

### Step 6.2 — pure logic out — **done**

- [x] `src/teams/` gets the non-React parts: `sortUsers`, filtering, `usersAndTeamsToPageFormat`,
      the page-state shape and its transitions.
- [x] Unit-test them directly now they are reachable.
- [x] Lower-case the filter query as it is extracted (see the findings above), and update the one
      step 6.1 assertion that pins the broken behaviour.

Four modules, each stateable in a sentence: `pageState.ts` (196) is the panel's state — its
shape, how it is built from the global state, how its stats are refreshed, and what it saves;
`pageStateEdits.ts` (328) is every edit, each `(pageState, args) => pageState`; `userList.ts`
(109) is the pure view of the user table, sorting and visibility; `colourSchemes.ts` (52) is the
auto-colour palettes, a data leaf both the dropdown and `recolourTeams` read. `UsersAndTeams.tsx`
is 1348 → 923, and what is left of it above the JSX is wiring: each handler now reads
`applyEdit(edits.something(pageState, …))`.

Two things worth knowing before step 6.3:

- **The extracted edits are not pure, and their header says so.** Several copy only the part of
  the state they change, and a few mutate the map or set they were handed. That is exactly why
  `recalcStatsForPageState` takes `alreadyCloned` — each edit's caller passes what that edit
  actually did. Made faithful rather than fixed: making them properly immutable is invisible in
  principle but not provably so, and it is a change to make deliberately, not in passing.
- **`initialPageState`'s `hiddenTeams: new Set()` was dropped**: not in
  `UsersAndTeamsPageState`, read by nothing (`reColourTeams`' `hiddenTeams` is a local of its
  own). Dead, like `nodeDepth` in Part 4.

**Verified:** step 6.1's tests pass unchanged apart from the filter assertion, now capitalised so
it proves the fix. The move was checked by the line-multiset diff, and every remaining difference
is a `setPageState` wrapper that became `applyEdit`, a signature that gained a parameter, or
prettier rejoining a line at lower indentation — the only JSX change in the file is
`sortHeaderStyle` gaining its first argument. The filter fix was shown to be covered by
reverting it: the unit test and the whole-panel test both fail. 244 unit tests (was 196);
`npm run check` green; `npm run e2e:strict` 16/16 clean.

### Step 6.3 — split the component

- [ ] Break the remaining markup into components per section: the teams table, the ignored-users
      table, the users table, the import/export controls.
- [ ] This is where the "UI change is permitted, not sought" rule earns its keep: if some
      behaviour forces an ugly structure, change it deliberately and note it in the commit.
- [ ] Point `EditAlias.tsx`'s Email label at the email input (see the findings above), and
      switch the alias test to `getByLabelText` — which then proves the fix rather than merely
      surviving it.

**Verify:** step 6.1's tests pass, unchanged apart from how the alias test reaches those two
inputs. `npm run e2e:strict` — shots 8 and 9 cover the Colours and Lines panel, not this one, so
expect clean; any diff means something moved that should not have. Manual: open the panel and
exercise each table by hand.

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
