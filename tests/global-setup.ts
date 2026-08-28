import fs from "node:fs";
import path from "node:path";

// The screenshot suite needs a data file plus a pinned `_state.json` sidecar,
// served from `data/` under a fixed name so `EXPLORER_DATA=explorertest`
// picks them up. Rather than committing a second 746 KB copy of default.json, we copy it
// here so the fixture always tracks the shipped default (spec.md §4.1). Both copies are
// gitignored.
export default function globalSetup() {
  const dataDir = path.resolve(import.meta.dirname, "../data");
  const fixturesDir = path.resolve(import.meta.dirname, "./fixtures");

  fs.copyFileSync(
    path.join(dataDir, "default.json"),
    path.join(dataDir, "explorertest.json")
  );
  fs.copyFileSync(
    path.join(fixturesDir, "explorertest_state.json"),
    path.join(dataDir, "explorertest_state.json")
  );
}
