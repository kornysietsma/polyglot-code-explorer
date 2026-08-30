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

## Part 4 — `nodeData.ts` → `src/model/` — **done**

Team aggregation first: it has the most tests and the cleanest seam.

`nodeData.ts`'s 882 lines are now `teamStats.ts` (456), `gitChanges.ts` (228), `nodeAccessors.ts`
(117), `coupling.ts` (111) and `couplingBuckets.ts` (39), with tests beside the two modules that
had any. **Part 5 is next.**

### Step 4.1 — team and user aggregation out — **done**

- [x] `src/model/teamStats.ts` (456 lines) takes the whole block, which turned out to be
      contiguous in `nodeData.ts` (lines 400-835): `UserStats`, `DEFAULT_USER_STATS`,
      `metricFrom`, `NO_TEAM_SYMBOL`, `nodeChangers`, `nodeChangersByTeam`,
      `sortedUserStatsAccumulators`, `nodeTopTeam`, `topTeamsPartitioned`, `nodeSingleTeam`,
      `addTeamStats`, `lastCommitDay`, `aggregate{User,Team}Stats` and their private helpers.
- [x] The block's only dependency back into `nodeData.ts` is `nodeChangeDetails`, which is now
      exported with a comment saying it moves to `model/gitChanges.ts` in step 4.2 and this
      import follows it there. `nodeData.ts` is down to 440 lines.
- [x] Tests split: the four team `describe`s and their helpers to
      `src/model/teamStats.test.ts`; only the coupling-distance `describe` stays in
      `nodeData.test.ts` (36 lines), waiting for step 4.3.

**Verified:** `npm run check` green — 187 tests, now across 18 files. The moved tests passed
unchanged, which is the proof: diffing the two new test files against the original as line
multisets shows every line accounted for and none rewritten. `npm run e2e:strict` 16/16 clean.

### Step 4.2 — git change details out — **done**

- [x] `src/model/gitChanges.ts` (228 lines): `nodeChangeDetails` and its three private helpers,
      `nodeLastChangeDay`, `nodeAge`, `nodeNumberOfChangers`, `ChurnData`, `nodeChurn*`,
      `findMaxima`, `calculateFileMaxima`. Two contiguous runs in `nodeData.ts`, and neither
      referenced anything left behind - a clean cut.
- [x] `teamStats.ts`'s import followed the code, as 4.1 promised, and `nodeChangeDetails`'
      temporary comment is replaced by one saying what it is. `nodeData.ts` is down to 228 lines
      and no longer imports from `state.ts` at all.
- [x] `nodeAge`'s day-0 bug is recorded in a comment at the line, not fixed.

**Verified:** `npm run check` green, 187 tests. Diffing HEAD's `nodeData.ts` against the two new
files shows every difference is a comment - not one line of code changed. `npm run e2e:strict`
16/16 clean.

No tests moved: `nodeData.test.ts` never covered this code. Its only remaining `describe` is the
coupling one, which step 4.3 takes.

### Step 4.3 — coupling out — **done**

- [x] `src/model/coupling.ts` (108 lines): `nodeCouplingData`, `nodeHasCouplingData`,
      `CouplingLink`, `nodeCouplingFiles`, `commonRoots`, `filesHaveMaxCommonRoots`,
      `nodeCouplingFilesFiltered`.
- [x] `couplingBuckets.ts` moved to `src/model/couplingBuckets.ts` unchanged but for its import
      path. Kept as its own module rather than merged: it computes global bucket ranges from
      `CouplingStats`, where `coupling.ts` reads one node's own buckets, and merging would drag a
      `viz.types` import into the latter.
- [x] The coupling-distance tests moved to `src/model/coupling.test.ts`; `nodeData.test.ts` is
      now empty of content and deleted.
- [x] `coupling.ts` still imports `nodePath` from `nodeData` - the one-line passthrough step 4.4
      inlines. Commented as such.

**Verified:** `npm run check` green, 187 tests. Code and tests both moved verbatim (diffed as
line multisets; only the new module header differs). `npm run e2e:strict` 16/16 clean.

**The plan's manual check was impossible as written, and that is worth recording.** Neither
tracked data file can render a coupling arc: `default.json` has the coupling feature on and 14
buckets, but _every_ `coupled_files` list in it is empty, and `nested.json` has coupling off
entirely. So the arcs were verified against a synthetic file instead - `default.json` with real
`coupled_files` written into four nodes - which rendered four arcs correctly through the
extracted module. The file was temporary and is deleted. This sharpens the existing
"regenerate `default.json`" follow-up in `CLAUDE.md`: the shipped sample cannot demonstrate
coupling at all, and neither can any test.

### Step 4.4 — what is left of nodeData — **done**

- [x] `nodePath` inlined to `node.path` at its 4 sites, spending the `// TODO: inline me`.
- [x] `nodeDepth` deleted: it was **dead**, one occurrence in the whole codebase, its own
      definition.
- [x] Everything else kept as-is and moved to `src/model/nodeAccessors.ts` (117 lines).
- [x] `nodeData.ts` deleted. Part 4 is complete: 882 lines became five modules.

**Verified:** `npm run check` green, 187 tests. Diffing HEAD's `nodeData.ts` against
`nodeAccessors.ts` shows exactly those two functions removed and nothing else but the new header.
`npm run e2e:strict` 16/16 clean.

**The inlining scope was deliberately narrowed, and why matters.** The plan said "inline the
one-line passthroughs that earn nothing", which reads as a size test. It is not: the test is
whether the name says more than the field path. `nodeCumulativeLinesOfCode` is a one-liner and
earns its keep by naming the opaque `node.value`; `nodeLanguage` and `nodeRemoteUrl` shorten real
chains. Only `nodePath` restated its own field.

Checked while deciding: **the accessors are not an abstraction barrier over the JSON shape**, so
the "one edit when the scanner changes" argument for keeping them does not apply. The shape
already leaks in seven places outside the accessor file - `preprocess.ts:114,131,224` and, since
this Part, `gitChanges.ts:50,70` and `coupling.ts:15`. They are a convenience layer used where
it is convenient. That is a fine thing to be, but it should not be mistaken for a boundary; the
module header now says so.

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
  check proves fiddly. **Step 4.3 found this is worse than uneven for coupling**: no tracked
  data file contains a single coupled file pair, so neither a screenshot nor a manual check is
  possible without a synthetic fixture. Step 7.1's arc-rendering check has the same problem and
  should plan for it.
- **A plan step's stated premise can be wrong.** Step 1.2 was written around a file that turned
  out to load fine, and following it literally would have shipped a guard refusing a working
  file. Check a step's factual claims before building on them, and correct `spec.md` when one
  does not hold.
