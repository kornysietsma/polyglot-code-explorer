# Dates and timezones: everything here is UTC

Written 2026-08-30, when the Explorer stopped rendering dates in the machine's local timezone.
This is the short version of what the dates on screen mean, aimed at anyone reading a diagram
rather than anyone maintaining the code.

## The one rule

**Every date the Explorer shows you, and every week it buckets commits into, is UTC.**

The date under a file in the inspector, the date range on the slider, the weeks along the
timescale at the bottom of the screen — all UTC, all the time, on every machine.

## Why UTC, and not your local time

Because the dates were never local in the first place.

The Explorer does not see commit timestamps. It sees whatever the
[Scanner](https://polyglot.korny.info) recorded, and the Scanner records a **day**, already
aligned to midnight UTC, rather than a moment. By the time a data file reaches this app, the
question "which day was this commit on?" has been asked and answered.

So there is no local time here to preserve. Rendering those already-UTC days in local time did
not add information — it just moved some of them. Reading a midnight-UTC timestamp in a timezone
behind UTC lands it on the previous evening, and so it displayed as the previous day:

| your timezone      | what `1554768000` used to display as |
| ------------------ | ------------------------------------ |
| `Europe/London`    | 09-Apr-2019 — correct by luck        |
| `America/New_York` | **08-Apr-2019** — a day early        |
| `Australia/Sydney` | 09-Apr-2019 — correct by luck        |

The two correct answers were correct only because those zones are at or ahead of UTC. Every zone
behind UTC — all of the Americas — was wrong, and the week buckets were subtly wrong everywhere,
landing on local midnight rather than on a real week boundary.

## What this means if you are not in the UK

The Explorer is written in the UK, where UTC is either local time or an hour off it, so this
rarely matters there. Further out it is worth knowing:

- **A late-evening commit is dated the next day.** 20:00 in New York is already past midnight in
  UTC, so the Explorer dates that commit tomorrow. This is the Scanner's day-alignment showing
  through, not a rounding error, and it is not something this app can undo.
- **A late-evening Saturday commit moves to the next week.** Weeks start on Sunday, UTC. A commit
  at 20:00 on a Saturday in New York is already Sunday in UTC, so it opens the following week's
  bucket on the timescale rather than closing the current one.
- **Nothing shifts as the clocks change.** Because none of this goes through local time, daylight
  saving has no effect on any date or bucket boundary. Before, a British summer week started at
  23:00 on the Saturday.

## The assumption the UI does not state

**The interface never displays a timezone.** There is no "UTC" label next to any date, and no
setting to change it.

That is a deliberate trade — the labels would be noise for the person the tool was built for —
but it does mean UTC is a standing assumption you have to bring with you. This page is where it
is written down. If you are comparing a date here against a date in a tool that _does_ use local
time, that is the difference to look for first.

## Where this lives in the code

For anyone changing it:

- `datetimes.ts`'s `humanizeDate` formats via `Intl.DateTimeFormat` with `timeZone: "UTC"`. Its
  locale is `en-US` rather than `en-GB` on purpose: `en-GB` abbreviates September as "Sept".
- `preprocess.ts`'s `startOfUnit` buckets weeks with integer arithmetic on unix days, so no
  `Date` — and therefore no timezone — is involved at all.
- `Viz.tsx` draws the timescale axis with d3's `scaleUtc` and a local `addUtcDays` that adds
  elapsed time rather than calendar days.
- `state.ts`'s `subYears`/`addDays` are the deliberate exception, and are commented as such: they
  pick where the date slider starts, with two days of leeway either side. A bound that exists to
  be dragged does not need to be exact.
