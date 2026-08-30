# Expressiveness refactor — spec

## Status

Phase 1 (test clarity, the `nestedCircles` screenshot suite, seven defect fixes) is **done and
committed**: `174d284`, `b86044d`, `262bf9b`, `e268255`. Its findings are folded into `CLAUDE.md`;
git holds the rest. This spec covers only what is left.

## Why

The codebase works and is now reasonably well tested — 163 unit tests and 16 screenshots — but it
sprawls. Four files carry 4,167 lines between them, and each mixes several unrelated concerns in
one namespace:

| file                | lines | what is tangled together                                                                                                         |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `UsersAndTeams.tsx` | 1348  | one 1219-line component: modal, three sortable tables, selection, filters, alias/team creation, import/export, colour management |
| `state.ts`          | 993   | the `Config` shape, a ~25-case `Action` union, the reducer, and `postprocessState`'s derived-data cache                          |
| `Viz.tsx`           | 944   | imperative D3/WebGL: draw, update, coupling arcs, timescale brush, zoom wiring, tooltip, GL recovery                             |
| `nodeData.ts`       | 882   | ~50 `nodeXxx` functions over four unrelated concerns: git change details, coupling, layout accessors, team aggregation           |

The goal is expressive, readable, modular code — each module about one thing, with a name that
says what that thing is. Tests already cover the risky logic; this is about where the code lives
and what it is called.

Three correctness items ride along, none dependent on the refactor: error visibility, UTC dates,
and the user lookup.

## Scope

In scope: all four files above, plus the three fixes below. Out of scope: the accessibility
regression, the visualisation-switch performance target, the tooltip contents, and regenerating
`default.json` — all remain in `CLAUDE.md`'s follow-ups.

## Working agreements

These shape every step in `plan.md`.

- **One reviewable commit per step.** Each step ends green (`npm run check`) with the screenshot
  suite explained — either zero diffs, or a deliberate re-baseline named in the commit. The repo
  is in a good state after every step, so work can stop between any two.
- **Behaviour-preserving by default; UI change is permitted, not sought.** Restructure the code
  and leave the UI alone — unless preserving some behaviour would force the new structure to be
  ugly, or the behaviour is plainly wrong. Then change it deliberately, say so, re-baseline.
  Do not go looking for things to improve.
- **New feature folders, following the existing convention.** `src/` already nests
  `inspectors/`, `visualizations/`, `webgl/`, `widgets/`. New folders join them rather than
  inventing a different scheme, and each folder is the obvious home for its own tests.
- **Tests move with the code they cover**, and are not rewritten to match new behaviour. A test
  that has to change to keep passing is a signal that the step was not behaviour-preserving —
  stop and decide, rather than editing the assertion.

## Part 1 — failures are visible

### The symptom

Loading a very large data file crashed the app, and **nothing was reported anywhere** — not in the
browser console, not in the Vite dev-server output. The crash matters less than the silence: a
failure nobody can see is a failure nobody can diagnose.

### What is actually happening

The file that failed is larger than anything on this machine, so the crash itself is still
unreproduced. But the heap-exhaustion hypothesis this section used to carry is **measured wrong**
for files of the size that _is_ available, and the real ceiling turned out to be somewhere else.

`data/spring-projects.json` — 514 MB, 80,691 nodes — **loads fine**, and afterwards the tab holds
508 MB against a 4,396 MB heap limit. The parsed graph is about the size of the text, not the
several GB assumed, and there is 8.6x headroom. Heap exhaustion is not what kills a file this big.

The hard ceiling is **V8's maximum string length**, 536,870,888 bytes: `response.json()` decodes
the whole body to a string before parsing it, so above that the load cannot succeed however much
heap is free. Confirmed in Chrome — `"a".repeat(536870889)` throws `RangeError: Invalid string
length`. `spring-projects.json` sits 23 MB under it, which is why it was the useful example even
though it is not the file that broke.

So the fix is to fail early and legibly on a file that cannot fit, checked against that limit —
which refuses nothing that currently works, and would have caught the larger file.

### What is definitely wrong regardless

Four gaps, each of which would make an _ordinary_ failure just as invisible. These are worth
fixing whether or not they explain this particular crash.

1. **There is no React error boundary anywhere.** Confirmed: nothing in `src/` implements
   `componentDidCatch` or `getDerivedStateFromError`. An exception thrown while rendering `App`,
   `Viz` or the inspectors unmounts the whole tree and leaves a blank page. React already
   complains about this in the console — the `Inspector` throwing `bad selected node` during the
   `nested.json` work produced _"An error occurred in the &lt;Inspector&gt; component. Consider
   adding an error boundary"_. `Loader.tsx`'s error list only covers the fetch-and-preprocess
   phase; once `App` mounts, nothing catches anything.
2. **`vite.config.ts`'s `createReadStream(filePath).pipe(res)` has no error handling.** A stream
   error — a read failure, or the client disconnecting mid-transfer, which is precisely what
   happens when a tab dies mid-download — emits an unhandled `'error'` event. Nothing logs it,
   which is a strong candidate for the silent Vite console.
3. **`vite.config.ts`'s bare `catch {}` around `statSync` discards the reason.** Answering 404 is
   right, but a permissions error, a path problem and a genuinely missing file become
   indistinguishable.
4. **`Loader.tsx` never checks `response.ok`.** A 500 or an HTML error page goes straight to
   `response.json()`, so the user sees a JSON syntax error instead of the actual HTTP failure.

### The decision

Make failures loud, then make the size limit explicit. Specifically: an error boundary around the
app, real error handling on the dev server's file streaming, an `response.ok` check, and a clear
up-front message when a data file is too large to load rather than a dead tab. A global
`unhandledrejection` / `window.onerror` hook catches whatever the boundary cannot.

This comes first in the plan, not because it is the most valuable, but because every later step
is easier to diagnose once a failure says so.

## Part 2 — dates are UTC

### The defect

The scanner emits day-aligned **UTC** unix timestamps. The app then round-trips them through
local-time `Date` operations it never needed:

- `datetimes.ts`'s `humanizeDate` formats with date-fns's local-time `format`, so on any machine
  **behind** UTC a commit renders as the previous day.
- `preprocess.ts`'s `startOfUnit` uses local `startOfWeek`, so week buckets land on local
  midnight rather than a real week boundary.

Measured on one timestamp (`1554768000` = Tuesday 9 April 2019, 00:00 UTC):

| zone               | `humanizeDate`    | week bucket start      |
| ------------------ | ----------------- | ---------------------- |
| `Europe/London`    | 09-Apr-2019 ✓     | 2019-04-06T23:00:00Z ✗ |
| `America/New_York` | **08-Apr-2019** ✗ | 2019-04-07T04:00:00Z ✗ |
| `Australia/Sydney` | 09-Apr-2019 ✓     | 2019-04-06T13:00:00Z ✗ |

### The decision

Everything is stored and displayed as **UTC**. Korny works in the UK, where UTC day and week
boundaries are close enough to local time to cause no confusion, and the tool is his.

Note the practical consequence: **in the UK this fix is very likely invisible.** The UK is never
behind UTC, so `humanizeDate` is already correct there, and the hour-early bucket boundary still
lands in the same week. The screenshot suite is therefore expected to show **zero** diffs — and
if it does not, that is a finding worth understanding, not a re-baseline.

### The approach

The bug exists only because day-aligned integers were pushed through a `Date`. So:

- **Week bucketing becomes integer arithmetic on unix seconds** — `d - ((d + 4) % 7)` days, where
  `d = floor(t / 86400)` and the `+ 4` is the offset from the epoch's Thursday to Sunday. No
  `Date`, so no timezone to get wrong. Verified exact against all three zones above.
- **Display uses `Intl.DateTimeFormat` with `timeZone: "UTC"`.** No new dependency.

`state.ts`'s `subYears`/`addDays` are ±2 days of deliberate slider leeway, not correctness — they
can stay on date-fns, but should be noted so the next reader does not think they were missed.

`Viz.tsx`'s timescale axis already uses `scaleUtc` and a hand-rolled `addUtcDays`; that is
correct today and gets checked against the new helpers rather than rewritten.

### The documentation

A short page, `docs/dates-and-timezones.md`, aimed at anyone reading a diagram:

- every date and week bucket in the app is UTC;
- what that means outside the UK — a late-evening US commit lands on the following day, and on
  the following week if it is a Saturday;
- why the scanner's day-aligned timestamps make UTC the honest choice rather than an arbitrary one;
- that the UI never displays a timezone, so UTC is the standing assumption.

Linked from `README.md`. `docs/rendering-performance.md` is currently unlinked from anywhere —
the same README section should pick it up.

## Part 3 — user lookup by id, not by array position

`state.ts`'s `getUserData` does `users[userId]` — **positional** indexing — and `isAlias` treats
any id `>= users.length` as an alias. So `metadata.git.users` must be dense with `index === id`,
an invariant nothing documents or checks. Building the `nested.json` fixture broke it by pruning
that array to the users actually referenced, and the failure surfaced as `Invalid user id` thrown
from deep inside the Inspector.

**There is no performance argument for keeping it.** Measured at ~5ns (array) versus ~13ns (Map)
per lookup, against three call sites — `exportImport.ts` twice, and `NodeChangeInspector.tsx`
once — all driven by a user action and bounded by one node's or one team's user count. Never
per-node, never per-frame. The genuinely hot path, `nodeData.ts`'s per-node aggregation, already
uses `possiblyAlias`, **which is a Map lookup**, so this makes the two consistent rather than
diverging.

While here: the error message reads `` `Invalid user id #{userId}` `` — Ruby interpolation in a
JavaScript template string, so it never reports the id.

## Part 4 — the refactor

### `nodeData.ts` → `src/model/`

Four concerns share one namespace. Split along the seams that already exist:

- git change details, age, churn, number of changers;
- team and user aggregation (well covered by tests already, lifts out cleanly — do this first);
- coupling links and the distance filter;
- the small layout/loc accessors, several of which are one-line passthroughs. `nodePath` is
  already marked `// TODO: inline me`.

### `state.ts` → `src/state/`

Config shape, action union, reducer, and derived-data cache into separate modules. Mostly
mechanical, but it touches every dispatch site, so it wants its own step.

### `UsersAndTeams.tsx` → `src/teams/`

The riskiest step in the plan, and the only file with no coverage at all. **Whole-panel tests
come first**, before anything moves: create a team, assign users, create an alias, ignore a user,
filter, sort. They assert on the actions dispatched rather than on markup, so they survive the
restructure and document what the panel is for. `@testing-library/react` is already a
devDependency and has never been used — this establishes the pattern for the repo.

Only once those are green does the component get broken up.

### `Viz.tsx`

One pure slice is already out (`vizNodeSelection.ts`). Remaining candidates, each its own module:
the coupling arc geometry, the timescale brush, and the zoom/camera wiring. `Viz.tsx` keeps the
imperative D3 shell that CLAUDE.md's test boundary says stays manually verified.

## What done looks like

- No file over ~400 lines among the four.
- Every new module has a name that says what it holds, and its tests sit beside it.
- `npm run check` green; `npm run e2e:strict` at zero tolerance either clean or deliberately
  re-baselined with the reason recorded.
- `CLAUDE.md` updated to describe the new layout; `spec.md` and `plan.md` deleted.
