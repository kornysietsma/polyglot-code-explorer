# Implementation plan: tooling & dependency refresh

Companion to [`spec.md`](./spec.md). The spec describes the resulting state and the design
decisions behind it; this file is the historical record of how it was executed.

**Status: COMPLETE.** All 23 steps across phases 0–7 landed on branch `big-cleanup` (one commit per
step), and all 7 manual gates passed. Spec §8's acceptance criteria were walked one by one at step
7.4 and all confirmed passing. `master` is untouched — this branch has not yet been merged.

Per-step rationale has been trimmed now that no future step depends on it — the design decisions
worth keeping live in `spec.md` instead (each step below says where). The git log on `big-cleanup`
is the authoritative commit-by-commit history.

---

## Manual gates (all passed)

| Gate   | After | Question                                                                        |
| ------ | ----- | ------------------------------------------------------------------------------- |
| **M1** | 0.1   | Does the app load and render `default.json`?                                    |
| **M2** | 0.2   | Is the circle-layout fix right (spec §3.2)?                                     |
| **M3** | 0.3   | Do the 10 Playwright baselines capture the app as it should look?               |
| **M4** | 3.6   | Full manual sweep — every visualisation, inspector, modal, coupling, save/load. |
| **M5** | 3.5   | Does the colour picker feel right (open/drag/dismiss-outside/no-reopen)?        |
| **M6** | 6.2   | Does a real publish work (`EXPLORER_DATA=... npm run build`, serve `dist/`)?    |
| **M7** | 7.4   | Final sign-off against spec §8 — all 9 criteria confirmed.                      |

---

## Step summary

### Phase 0 — Groundwork

- [x] 0.0 — Branch `big-cleanup` off `master`; `spec.md` + `plan.md` committed.
- [x] 0.1 — `default.json` version bumped 1.0.4 → 1.0.5 so it loads. **M1.**
- [x] 0.2 — Circle-packed layout fix: `circleAncestors` per-node count replaces
      `topLevelCirclePacked` (spec §3.2). **M2.**
- [x] 0.3 — Playwright + the 10 baseline screenshots established. **M3** — reference for every
      later step's screenshot diffs.

### Phase 1 — Package manager

- [x] 1.1 — yarn → npm; `package-lock.json`, `.nvmrc`/`engines` added.

### Phase 2 — CRA → Vite

- [x] 2.1 — Vite alongside CRA (superseded by 2.2).
- [x] 2.2 — Vite becomes primary; `react-scripts`/CRA removed; scripts match spec §6.6; port 5173.
- [x] 2.3 — Proper Vite idioms: `__APP_VERSION__`/`__EXPLORER_DATA__`, `import.meta.env.BASE_URL`.

### Phase 3 — Dependencies

- [x] 3.1 — React 19.2.8 + matching `@types/react*`.
- [x] 3.2 — TypeScript 6.0.3; `target: ES2022`, `moduleResolution: bundler`.
- [x] 3.3 — `moment` → `date-fns` (spec §6.4).
- [x] 3.4 — `react-widgets` `NumberPicker` → `react-aria-components` `NumberField` (spec §6.4).
- [x] 3.5 — `use-onclickoutside` → `useInteractOutside` (spec §6.4). **M5.**
- [x] 3.6 — Remaining runtime bumps to spec §5's target versions. **M4.**

### Phase 4 — Tests

- [x] 4.1 — Jest → Vitest 4; `@testing-library/react` 16.3.2; `.npmrc` deleted.

### Phase 5 — Lint & format

- [x] 5.1 — ESLint 10 flat config (`eslint.config.ts`; composition and rule exceptions in
      spec §6.7).
- [x] 5.2 — Prettier 3, formatting-only commit; `.prettierignore` added.

### Phase 6 — Data restructure

- [x] 6.1 — `public/data/` → top-level `data/`; `serveDataDir()` dev middleware (spec §6.2).
- [x] 6.2 — `copyDataFile()` `writeBundle` plugin ships exactly one data file per build
      (spec §6.2). **M6.**

### Phase 7 — Cleanup & docs

- [x] 7.1 — Removed CRA cruft (`reportWebVitals`, `web-vitals`, `immer`, stray `console.log`s);
      sourced real favicon/logo icons (spec §10).
- [x] 7.2 — README/CLAUDE.md/Releasing.md/CHANGELOG.md updated for npm/Vite; `.github/` deleted.
- [x] 7.3 — `publish_*.sh` ported to npm/`dist`; confirmed gitignored and untracked, matching their
      pre-refresh state (spec §2).
- [x] 7.4 — Final acceptance: spec §8 criteria 1–9 all confirmed. **M7.**

---

## Follow-ups

Deferred, out of scope for this refresh — see spec §9 for detail: regenerating `default.json` with
the current scanner (`nestedCircles` root), re-verifying against real scanner-generated multi-repo
output once `polyglot-code-offline-layout`'s `nested-circles` branch lands, consolidating the four
`publish_*.sh` scripts, and TypeScript 7 once `typescript-eslint` supports it.

## Rollback

Every step is one commit on `big-cleanup`; `master` is untouched. To undo a step, `git revert` it —
no step depends on a later one. To abandon the project, delete the branch.
