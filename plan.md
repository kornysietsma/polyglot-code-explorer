# Expressiveness refactor — plan

Read `spec.md` first. This is the ordered checklist; each step is one reviewable commit, sized
for a single ~30-60 minute session, ending green and leaving the repo in a good state.

## Technical context

**Where things stand.** Phase 1 landed 163 unit tests across 14 files, plus 16 screenshots in two
Playwright projects (`chromium` on `default.json`, `chromium-nested` on `nested.json`). The
existing tests are the safety net for everything below — they are not to be rewritten to match
new behaviour.

**Verification available to each step:**

| tool                    | what it proves                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run check`         | typecheck, lint, format, 163 unit tests                               |
| `npm run e2e:strict`    | all 16 screenshots at **zero** tolerance — the real regression signal |
| `npm run e2e:update`    | re-baseline, only ever with a stated reason                           |
| `TZ=... npx vitest run` | timezone-dependent behaviour (Part 2 only)                            |

**The zero-tolerance rule.** A pure refactor must produce zero screenshot diffs. This already
proved itself: extracting `vizNodeSelection.ts` moved not one pixel. If a step that should be
behaviour-preserving shows a diff, that is a bug found, not a baseline to update.

**Design decisions taken in the spec**, restated here because they govern every step: UTC via
integer arithmetic and `Intl`, no new dependency; user lookup by Map with alias ids left on their
id threshold; new feature folders under `src/`; behaviour-preserving unless deliberately and
visibly decided otherwise.

**Ordering rationale.** The three correctness fixes come first: they are small, independent of
the refactor, and clear the open questions. Error visibility leads, because a silent failure
during any later step would cost more than the step itself. Within the refactor, each file starts with its
best-tested seam so the first cut is the safest one. `UsersAndTeams.tsx` gets its tests before
anything moves.

---

## Part 1 — failures are visible

Small, independent, and first: every later step is easier to diagnose once a failure says so.

### Step 1.1 — an error boundary, and a global handler behind it

- [x] Add a React error boundary wrapping `App` in `Loader.tsx`, rendering the error and its
      component stack rather than a blank page. Reuse the existing error-list markup so a
      render-time failure looks like a load-time one.
- [x] Register `window.onerror` and an `unhandledrejection` listener in `index.tsx`, so anything
      thrown outside React's render — a D3 callback, a rejected fetch — is logged rather than lost.
- [x] Check the boundary does not interfere with `Viz.tsx`'s deliberate GL context-loss recovery,
      which handles its own failures and must keep doing so.

**Verify:** a unit test rendering a component that throws, asserting the boundary shows the
message instead of unmounting. Manual: temporarily make `Inspector` throw, confirm the page shows
the error rather than going blank, then revert. `npm run e2e:strict` clean.

### Step 1.2 — the data-loading path reports what went wrong

- [x] `Loader.tsx`: check `response.ok` before `response.json()`, so an HTTP failure reports
      itself rather than surfacing as a JSON syntax error.
- [x] `Loader.tsx`: fail early and clearly on a data file too large to load — read
      `Content-Length` first and refuse, with the size and the limit in the message. The
      threshold is **V8's maximum string length**, 536,870,888 bytes, not a chosen number: see
      `spec.md`, which this step corrected. `spring-projects.json` (514 MB) turned out to load
      fine with 8.6x heap headroom, so a threshold below it would have refused a working file.
- [x] `vite.config.ts`: handle `'error'` on the read stream and on the response in
      `serveDataDir`, logging the path and the cause. This is the most likely reason the Vite
      console said nothing.
- [x] `vite.config.ts`: log the reason in the `statSync` `catch` before answering 404, so a
      permissions or path problem is distinguishable from a missing file. `ENOENT` stays quiet —
      every data file without a `_state.json` sidecar asks for one and misses.

**Verify:** unit test the size and `response.ok` guards against a stubbed `fetch`. Manual, and the
real proof: run `EXPLORER_DATA=spring-projects npm start` and confirm the app now says why it
will not load rather than dying silently. Manually confirm a small file still loads.
`npm run e2e:strict` clean.

---

## Part 2 — dates are UTC

### Step 2.1 — UTC week bucketing

- [ ] Replace `preprocess.ts`'s `startOfUnit`/`startOfWeek` with integer arithmetic on unix
      seconds: `d = floor(t / 86400)`, bucket start day `d - ((d + 4) % 7)`. Keep `TimescaleUnit`
      as the extension point.
- [ ] Drop the now-unused date-fns imports from `preprocess.ts`.

**Verify:** existing `gatherTimescaleData` tests still pass unchanged (they assert Sunday
pinning and same-week merging already). Add one test asserting the same bucket start for the
same timestamp under `TZ=America/New_York`, `TZ=Europe/London` and `TZ=Australia/Sydney` — run
via `process.env.TZ` set before the call, or three explicit expectations against known epochs.
`npm run e2e:strict` **must be clean**: in the UK the old and new buckets fall in the same week.

### Step 2.2 — UTC date display

- [ ] `datetimes.ts`'s `humanizeDate` uses `Intl.DateTimeFormat` with `timeZone: "UTC"`,
      preserving the exact `dd-MMM-yyyy` output the current baselines contain.
- [ ] Leave `state.ts`'s `subYears`/`addDays` on date-fns, with a comment saying they are
      deliberate ±2-day slider leeway rather than an oversight.
- [ ] Check `Viz.tsx`'s `scaleUtc`/`addUtcDays` against the new helpers; they are already
      correct, so this is a read-and-confirm, not a rewrite.

**Verify:** unit test asserting `humanizeDate(1554768000) === "09-Apr-2019"` under all three
timezones — this is the assertion that fails today in `America/New_York`. `npm run e2e:strict`
must be clean, since the UK output is unchanged. If any shot moves, stop and find out why.

### Step 2.3 — document it

- [ ] Write `docs/dates-and-timezones.md` per the spec: what the dates mean, the non-UK edge
      cases, why UTC is the honest choice given day-aligned scanner timestamps, and that the UI
      never shows a timezone.
- [ ] Add a "Design notes" section to `README.md` linking it, and picking up the currently
      unlinked `docs/rendering-performance.md`.
- [ ] Remove the timezone entry from `CLAUDE.md`'s "Known follow-ups".

**Verify:** `npm run format:check`; read the page back for a reader who does not know the code.
No code change, so no screenshot run needed.

---

## Part 3 — user lookup

### Step 3.1 — look users up by id

- [ ] Build a `Map<number, UserData>` for user lookup (in `VizMetadata`, beside `users`, or
      derived in `postprocessUsers` — decide when the call sites are in view).
- [ ] `getUserData` uses it. Fix the error message: `` `Invalid user id #{userId}` `` is Ruby
      interpolation in a JS template string and never reports the id.
- [ ] Validate density once, on load, with an error naming the problem — alias ids are still
      allocated from `users.length` upward, so a sparse array is genuinely unsupported and should
      say so rather than throwing from inside the Inspector.
- [ ] Comment `isAlias` to record that the id threshold is a deliberate remaining assumption.

**Verify:** unit tests for the lookup and for the density check's error. The `exportImport`
round-trip tests already exercise `getUserData` via `toExportUser` and must pass unchanged.
`npm run e2e:strict` clean. Manual: open the app, select a file with commits, confirm the
Inspector's changers table still names people.

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
      colour-key helpers.

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

- [ ] First use of `@testing-library/react` in this repo, so this step also sets the pattern:
      render the real panel against a `minimalState`, assert on **dispatched actions** rather
      than markup so the tests survive the restructure.
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
      date-to-scale mapping testable.

**Verify:** `npm run e2e:strict` — the timescale is visible in shots 1, 10, and every nested
shot, so this step has real screenshot coverage. Clean means faithful.

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
