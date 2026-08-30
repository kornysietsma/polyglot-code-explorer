import { describe, expect, it } from "vitest";

import { filesHaveMaxCommonRoots } from "./coupling";

describe("filtering coupling by distance", () => {
  // The filter counts how many leading directories two files share, and keeps the pairs that
  // share at most that many - so a low setting shows only coupling that reaches across the
  // codebase, and a high one lets nearby files through too.
  it.each([
    // file1, file2, shared leading directories
    ["src/a.js", "test/a.js", 0],
    ["src/a.js", "src/b.js", 1],
    ["src/deep/a.js", "src/deep/b.js", 2],
    ["src/deep/a.js", "src/other/b.js", 1],
    // files at different depths: only the segments that exist in both can be shared
    ["src/a.js", "src/deep/b.js", 1],
    ["README.md", "src/a.js", 0],
    // a file against itself shares every one of its own segments and no more - the loop used to
    // run off the end of both arrays and count a phantom `undefined === undefined` match
    ["a", "a", 1],
    ["src/deep/a.js", "src/deep/a.js", 3],
  ])("%s and %s share %d roots", (file1, file2, shared) => {
    // shares exactly `shared`, so a limit of `shared` keeps it and one below drops it
    expect(filesHaveMaxCommonRoots(shared, file1, file2)).toBe(true);
    expect(filesHaveMaxCommonRoots(shared - 1, file1, file2)).toBe(
      // ...unless `shared - 1` is negative, which means "no filter" and keeps everything
      shared === 0
    );
  });

  test("a negative limit is the 'no filter' setting, not a limit of zero", () => {
    expect(filesHaveMaxCommonRoots(-1, "src/deep/a.js", "src/deep/b.js")).toBe(
      true
    );
  });
});
