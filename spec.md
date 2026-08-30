# Expressiveness refactor — spec

## Status

Phase 1 (test clarity, the `nestedCircles` screenshot suite, seven defect fixes) is **done and
committed**: `174d284`, `b86044d`, `262bf9b`, `e268255`. Its findings are folded into `CLAUDE.md`;
git holds the rest.

Of this spec, **Parts 1 and 2 are done and committed** — error visibility (`72f820c`, `e9e4453`)
and UTC dates (`4438d4c`, `70b73d3`, `89ed94b`). Their sections below now record what was decided
and what was found, rather than what is planned. **Parts 3 and 4 remain**, with `plan.md` holding
the ordered steps.

## Why

The codebase works and is now reasonably well tested — 181 unit tests and 16 screenshots — but it
sprawls. Four files carry 4,172 lines between them, and each mixes several unrelated concerns in
one namespace:

| file                | lines | what is tangled together                                                                                                         |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| `UsersAndTeams.tsx` | 1348  | one 1219-line component: modal, three sortable tables, selection, filters, alias/team creation, import/export, colour management |
| `state.ts`          | 998   | the `Config` shape, a ~25-case `Action` union, the reducer, and `postprocessState`'s derived-data cache                          |
| `Viz.tsx`           | 944   | imperative D3/WebGL: draw, update, coupling arcs, timescale brush, zoom wiring, tooltip, GL recovery                             |
| `nodeData.ts`       | 882   | ~50 `nodeXxx` functions over four unrelated concerns: git change details, coupling, layout accessors, team aggregation           |

The goal is expressive, readable, modular code — each module about one thing, with a name that
says what that thing is. Tests already cover the risky logic; this is about where the code lives
and what it is called.

Three correctness items ride along, none dependent on the refactor: error visibility and UTC
dates, both now done, and the user lookup, which is next.

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

### The decision, and what shipped

Make failures loud, then make the size limit explicit. Four gaps were fixed, each of which would
have made an _ordinary_ failure just as invisible as the crash:

1. **An error boundary now wraps `App`** (`ErrorBoundary.tsx`), rendering the message and
   component stack through the same `ErrorReport` markup `Loader` uses for load-time errors, so a
   render-time failure looks like a load-time one instead of blanking the page. It catches
   render-time failures only: `Viz.tsx`'s WebGL context-loss recovery runs in native canvas event
   handlers, which never reach a boundary and keep handling themselves.
2. **`index.tsx` registers global `error` and `unhandledrejection` handlers**
   (`globalErrorHandlers.ts`), for anything thrown outside React's render. They log; they do not
   surface in the UI.
3. **`vite.config.ts` handles stream and response errors**, and warns when the client disconnects
   mid-transfer — which is exactly what a tab dying mid-download looks like, and was the most
   likely reason its console said nothing. Its `statSync` catch now logs the reason, except
   `ENOENT`, which is routine: every data file without a `_state.json` sidecar asks for one and
   misses.
4. **`Loader.tsx` checks `response.ok`** before `json()`, so an HTTP failure reports itself rather
   than surfacing as a JSON syntax error, and **refuses an oversized file** from `Content-Length`
   before reading the body, cancelling the download.

This came first in the plan, not because it is the most valuable, but because every later step is
easier to diagnose once a failure says so — which paid off immediately, since the boundary is
what makes a mid-refactor throw legible.

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

### The decision, and what shipped

Everything is stored and displayed as **UTC**. Korny works in the UK, where UTC day and week
boundaries are close enough to local time to cause no confusion, and the tool is his.

The bug existed only because day-aligned integers were pushed through a `Date`, so:

- **Week bucketing is integer arithmetic on unix seconds** — `d - ((d + 4) % 7)` days, where
  `d = floor(t / 86400)` and the `+ 4` is the offset from the epoch's Thursday to Sunday. No
  `Date`, so no timezone to get wrong. The `% 7` is doubled so it stays right for pre-epoch
  dates. Verified against a UTC reference over 292,196 timestamps from 1900 to 2100 in six
  timezones, zero mismatches: leap years, the century rules and leap seconds all need no special
  case, because unix time is 86400 seconds per day _by definition_ and the weekday cycle never
  breaks.
- **Display uses `Intl.DateTimeFormat` with `timeZone: "UTC"`.** No new dependency. The locale is
  **`en-US`, not `en-GB`** despite this being a UK tool: en-GB abbreviates September as "Sept",
  which would silently have changed the output. en-US matches date-fns' `MMM` for all twelve
  months, so nothing but the timezone changed.

`state.ts`'s `subYears`/`addDays` stay on date-fns — ±2 days of deliberate slider leeway, not
correctness — and are commented so the next reader does not think they were missed. They are also
the only thing left that can make a screenshot baseline timezone-dependent, and then only across a
daylight-saving boundary. `Viz.tsx`'s `scaleUtc`/`addUtcDays` were checked and are correct as they
stand.

**The prediction of zero screenshot diffs was half wrong, and the finding was worth having.**
Bucket _membership_ is unchanged in the UK as expected — but the bucket's start _timestamp_ is
what the timescale plots, and it moves an hour under BST, from Saturday 23:00 UTC (local midnight,
not a week boundary) to Sunday 00:00 UTC. Nine shots were re-baselined deliberately, after
confirming the changed pixels were confined to the timescale strip and identical across
date-sensitive and date-insensitive visualisations alike — no polygon moved.

### The documentation

`docs/dates-and-timezones.md`, aimed at anyone reading a diagram rather than maintaining the code:
what the dates mean, what UTC implies outside the UK, why the scanner's day-aligned timestamps
make UTC the honest choice rather than an arbitrary one, and that the UI never displays a
timezone so UTC is a standing assumption. Linked from a new `README.md` "Design notes" section,
which also picks up the previously unlinked `docs/rendering-performance.md`.

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
restructure and document what the panel is for. Part 1 put `@testing-library/react` into use for
the first time (`ErrorBoundary.test.tsx`, `Loader.test.tsx`), so the pattern exists to follow
rather than invent — this step only has to scale it to a much larger component.

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
