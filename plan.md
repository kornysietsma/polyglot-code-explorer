# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

**Parts 1 and 2 are done** (`72f820c`, `e9e4453`, `4438d4c`, `70b73d3`, `89ed94b`). Their durable
findings are in `CLAUDE.md`, `docs/dates-and-timezones.md` and the commits; what is worth carrying
forward is folded into the context below. **Part 3 is done; Part 4 is next.**

## Technical context

**Where things stand.** 181 unit tests across 17 files, plus 16 screenshots in two Playwright
projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The existing tests
are the safety net for everything below — they are not to be rewritten to match new behaviour.

The four files this work is about, as they stand now:

| file                | lines |
| ------------------- | ----- |
| `UsersAndTeams.tsx` | 1348  |
| `state.ts`          | 998   |
| `Viz.tsx`           | 944   |
| `nodeData.ts`       | 882   |

**Verification available to each step:**

| tool                                         | what it proves                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                              | typecheck, lint, format, 181 unit tests                               |
| `npm run e2e:strict`                         | all 16 screenshots at **zero** tolerance — the real regression signal |
| `npx playwright test --update-snapshots=all` | re-baseline, only ever with a stated reason (see below)               |

**The zero-tolerance rule.** A pure refactor must produce zero screenshot diffs. This has proved
itself twice: extracting `vizNodeSelection.ts` moved not one pixel, and every step of Parts 1
and 2 that should have been invisible was. If a step that should be behaviour-preserving shows a
diff, that is a bug found, not a baseline to update.

**Re-baselining, when a diff is genuinely intended.** Do not use `npm run e2e:update` — the 2%
tolerance means it can report "10 passed" and rewrite nothing, leaving a stale baseline in place.
Use `npx playwright test --update-snapshots=all`, then `npm run e2e:strict` to prove the
baselines actually moved. Before updating anything, work out _which pixels_ changed and satisfy
yourself the change is the intended one; Part 2 did this by diffing actual-vs-expected PNGs and
checking the changed pixels' y-range and count were identical across date-sensitive and
date-insensitive visualisations alike.

**What Parts 1 and 2 established that later steps can lean on:**

- **`@testing-library/react` is now in use** (`ErrorBoundary.test.tsx`, `Loader.test.tsx`), so
  Part 6 no longer has to invent the pattern — only extend it to a much bigger component. Both
  existing examples render a real component and assert on visible outcomes; `Loader.test.tsx`
  also shows how to drive one with a stubbed `fetch`.
- **A React error boundary now wraps `App`**, and `index.tsx` registers global `error` /
  `unhandledrejection` handlers. A component that throws mid-refactor shows its message and
  component stack instead of blanking the page — worth remembering when a later step breaks
  something, because the page will now tell you what.
- **`vi.stubEnv("TZ", …)` works in-process** for timezone-dependent tests; Node re-reads `TZ`
  on assignment.
- **Prove a new test discriminates**: stash just the production file with `git stash push -q`,
  confirm the test fails without it, then `git stash pop -q`. Both Part 2 steps did this, and it
  is what separates a real assertion from a vacuous one.

**Design decisions taken in the spec**, restated here because they govern every step: user lookup
by Map with alias ids left on their id threshold; new feature folders under `src/`;
behaviour-preserving unless deliberately and visibly decided otherwise.

**Ordering rationale.** The remaining correctness fix comes first: it is small and independent of
the refactor. Within the refactor, each file starts with its best-tested seam so the first cut is
the safest one. `UsersAndTeams.tsx` gets its tests before anything moves.

---

## Part 3 — user lookup

### Step 3.1 — look users up by id — **done**

- [x] `VizMetadata` gained `usersById: Map<number, UserData>` beside `users`, built by
      `preprocess.indexUsersById`. `users` stays the list because the alias threshold and the
      users table both want it in order.
- [x] `getUserData` now takes `metadata` rather than `users`, and looks up through the map. Error
      message fixed to report the id.
- [x] `indexUsersById` validates density (`users[i].id === i`) on load and **throws**, so the
      `ErrorReport` names the position and the id that disagree. Fatal rather than a warning
      because a gap makes the first alias collide with a real user — silent mis-attribution.
- [x] `isAlias` commented; the id threshold is recorded as a deliberate remaining assumption.
- [x] `testFixtures.vizMetadata` derives `usersById` from whatever `users` a test overrides, so
      no existing test had to change.

**Verified:** 187 unit tests green (was 181); both new error-path tests proved to discriminate by
neutering the check and the message. `npm run e2e:strict` 16/16 clean. Manually confirmed the
Inspector's changers table still names people, and that a hand-mangled sparse data file is
refused with the new message on screen.

---

## Part 4 — `nodeData.ts` → `src/model/`

Team aggregation first: it has the most tests and the cleanest seam.

### Step 4.1 — team and user aggregation out

- [ ] Move `nodeChangers`, `nodeChangersByTeam`, `nodeTopTeam`, `nodeSingleTeam`,
      `topTeamsPartitioned`, `aggregate*Stats`, `add*Stats`, `UserStats`, `metricFrom`,
      `NO_TEAM_SYMBOL` to `src/model/teamStats.ts`.
- [ ] Move the matching tests out of `nodeData.test.ts` to sit beside it.

**Verify:** `npm run check` — the moved tests pass unchanged, which is the whole proof.
`npm run e2e:strict` clean.

### Step 4.2 — git change details out

- [ ] `src/model/gitChanges.ts`: `nodeChangeDetails` and its helpers, `nodeLastChangeDay`,
      `nodeAge`, `nodeNumberOfChangers`, `nodeChurn*`, `ChurnData`, `findMaxima`,
      `calculateFileMaxima`.
- [ ] While here, note (do not fix) that `nodeAge`'s `if (!lastDay)` treats day 0 as absent.

**Verify:** as 4.1.

### Step 4.3 — coupling out

- [ ] `src/model/coupling.ts`: `nodeCouplingFiles*`, `commonRoots`, `filesHaveMaxCommonRoots`,
      `CouplingLink`, `nodeHasCouplingData`, plus `couplingBuckets.ts` if it belongs there too.
- [ ] Move the coupling-distance tests across.

**Verify:** as 4.1, and manually check coupling arcs still render — `default.json` has coupling
enabled but no screenshot covers it, so this is eyes-on via `npm start`.

### Step 4.4 — what is left of nodeData

- [ ] Whatever remains is layout and loc accessors. Inline the one-line passthroughs that earn
      nothing (`nodePath` is already marked `// TODO: inline me`), and give the rest a home —
      `src/model/nodeAccessors.ts` or similar.
- [ ] Delete `nodeData.ts` if nothing is left.

**Verify:** `npm run check`, `npm run e2e:strict` clean.

---

## Part 5 — `state.ts` → `src/state/`

### Step 5.1 — config and its defaults out

- [ ] `src/state/config.ts`: the `Config` type, `initialiseGlobalState`, `themedColours`,
      colour-key helpers. `initialiseGlobalState` holds the one deliberate piece of local-time
      date arithmetic left in the app (`subYears`/`addDays` for the slider bounds) — move the
      comment with it.

**Verify:** `npm run check`; `vizUpdatePaths.test.ts` and `state.test.ts` exercise these heavily
and must pass unchanged. `npm run e2e:strict` clean.

### Step 5.2 — actions and reducer out

- [ ] `src/state/actions.ts` for the `Action` union, `src/state/reducer.ts` for
      `updateStateFromAction`. Keep the exhaustive `never` check — it is what makes an unhandled
      action a compile error.

**Verify:** `npm run check` — deliberately delete one `case` locally and confirm the `never`
check still fails the build, then restore it. `npm run e2e:strict` clean.

### Step 5.3 — derived data out

- [ ] `src/state/derived.ts`: `postprocessState`, `buildUserTeams`, `globalDispatchReducer`.
      Keep the recompute-on-diff pattern exactly — `state.test.ts` pins both halves of it.

**Verify:** `state.test.ts` passes unchanged. `npm run e2e:strict` clean.

---

## Part 6 — `UsersAndTeams.tsx` → `src/teams/`

Tests before anything moves.

### Step 6.1 — whole-panel tests

- [ ] Follow the `@testing-library/react` pattern Part 1 established (`ErrorBoundary.test.tsx`,
      `Loader.test.tsx`): render the real panel against a `minimalState`, assert on **dispatched
      actions** rather than markup so the tests survive the restructure.
- [ ] Cover: create a team, assign users to it, create an alias, ignore a user, filter the user
      list, sort by a column.
- [ ] Check `index.tsx`'s missing `React.StrictMode` does not bite — this component is ordinary
      React, but confirm rather than assume.

**Verify:** the new tests are the verification. No production change, so `npm run e2e:strict`
must be clean.

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

### Step 7.1 — coupling arcs out

- [ ] `src/webgl/` is for GL; coupling arcs are SVG overlay geometry. `arcPath`,
      `normalizedCouplingNodes` and the arc styling go to their own module, keeping the pure
      geometry separable from the D3 selection code.

**Verify:** `npm run check`; unit-test `arcPath` now it is reachable. Manual: coupling arcs on
`default.json`, since no screenshot covers them.

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

- [ ] Confirm no file among the four is over ~400 lines.
- [ ] Update `CLAUDE.md`'s architecture section to describe the new layout, replacing the
      file-by-file descriptions that this work invalidates.
- [ ] `npm run check` and `npm run e2e:strict` green from a clean checkout.
- [ ] Delete `spec.md` and `plan.md`; git keeps the history.

## Known risks

- **Import churn.** Moving modules touches many files' import lists. `simple-import-sort` fixes
  ordering automatically (`npm run lint:fix`), so the churn is noise rather than work — but it
  makes diffs large, and a real change can hide in one. Keep each step to a single concern.
- **`UsersAndTeams.tsx` is 1219 lines in one function.** Step 6.1 exists precisely because
  moving it blind is the riskiest thing in this plan. If those tests turn out to be hard to
  write, that is information — stop and reconsider the split before continuing.
- **Screenshot coverage is uneven.** Coupling arcs and the Users and Teams panel have none, so
  steps 4.3, 6.3 and 7.1 lean on manual checks. Consider adding shots for them if the manual
  check proves fiddly.
- **A plan step's stated premise can be wrong.** Step 1.2 was written around a file that turned
  out to load fine, and following it literally would have shipped a guard refusing a working
  file. Check a step's factual claims before building on them, and correct `spec.md` when one
  does not hold.
