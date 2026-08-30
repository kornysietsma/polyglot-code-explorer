import fs from "node:fs";
import path from "node:path";

// Each screenshot project needs a data file plus a pinned `_state.json` sidecar, served from
// `data/` under a fixed name so `EXPLORER_DATA=<name>` picks them up. The data files themselves
// are already in `data/` - copying them to the fixture name keeps the committed originals free
// to be loaded by hand (`EXPLORER_DATA=nested npm start`) without a test's pinned UI state
// tagging along. The copies are gitignored.
const FIXTURES: { data: string; fixture: string }[] = [
  // the shipped sample: a `circlePack` root, circles at the top level only
  { data: "default", fixture: "explorertest" },
  // the nestedCircles fixture: circle packing recurses, so circle depth varies per branch
  { data: "nested", fixture: "explorernested" },
];

export default function globalSetup() {
  const dataDir = path.resolve(import.meta.dirname, "../data");
  const fixturesDir = path.resolve(import.meta.dirname, "./fixtures");

  for (const { data, fixture } of FIXTURES) {
    fs.copyFileSync(
      path.join(dataDir, `${data}.json`),
      path.join(dataDir, `${fixture}.json`)
    );
    fs.copyFileSync(
      path.join(fixturesDir, `${fixture}_state.json`),
      path.join(dataDir, `${fixture}_state.json`)
    );
  }
}
