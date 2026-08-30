import { describe, expect, it, test, vi } from "vitest";

import { NodeLayoutAlgorithm } from "./polyglot_data.types";
import {
  countLanguagesIn,
  gatherGlobalStats,
  gatherTimescaleData,
  indexUsersById,
  linkParents,
  postprocessUsers,
} from "./preprocess";
import {
  gitDetails,
  minimalDirectoryNode,
  minimalFileNode,
  minimalGitData,
  minimalPolyglotData,
} from "./testFixtures";

function directory(
  name: string,
  algorithm: NodeLayoutAlgorithm,
  children: Parameters<typeof minimalDirectoryNode>[2]
) {
  return minimalDirectoryNode(name, name, children, { layout: { algorithm } });
}

function file(name: string, algorithm: NodeLayoutAlgorithm = "voronoi") {
  return minimalFileNode(name, name, { layout: { algorithm } });
}

// Unix timestamps, all day-aligned, as the scanner emits them.
const DAY = 24 * 60 * 60;
const SUNDAY = 1554768000 - 2 * DAY; // 2019-04-07, the Sunday before 2019-04-09
const MONDAY = SUNDAY + DAY;
const NEXT_SUNDAY = SUNDAY + 7 * DAY;

describe("circleAncestors", () => {
  test("varies per branch under a nestedCircles root", () => {
    // mirrors omf.json's shape: a nestedCircles root, one circlePack branch
    // ("nesteda") nested two deep, and one plain voronoi sibling branch.
    const nestedFile = file("nestedFile");
    const nesteda = directory("nesteda", "circlePack", [nestedFile]);
    const plainFile = file("plainFile");
    const plainBranch = directory("plain", "voronoi", [plainFile]);
    const root = directory("root", "nestedCircles", [nesteda, plainBranch]);

    linkParents(minimalPolyglotData(root));

    expect(root.circleAncestors).toBe(0);
    expect(nesteda.circleAncestors).toBe(1);
    expect(nestedFile.circleAncestors).toBe(2);
    expect(plainBranch.circleAncestors).toBe(1);
    expect(plainFile.circleAncestors).toBe(1);
  });

  test("links every node back to its parent, leaving the root's parent unset", () => {
    const child = file("child");
    const branch = directory("branch", "voronoi", [child]);
    const root = directory("root", "voronoi", [branch]);

    linkParents(minimalPolyglotData(root));

    expect(child.parent).toBe(branch);
    expect(branch.parent).toBe(root);
    expect(root.parent).toBeUndefined();
  });

  test("rejects a data file whose root is a single file rather than a directory", () => {
    expect(() => linkParents(minimalPolyglotData(file("lonely")))).toThrow(
      /not a directory/
    );
  });
});

describe("gatherGlobalStats", () => {
  test("takes the earliest and latest dates across all of a tree's git history", () => {
    const early = minimalFileNode("early", "early", {
      data: { git: minimalGitData([gitDetails(SUNDAY, [0])]) },
    });
    const late = minimalFileNode("late", "late", {
      data: { git: minimalGitData([gitDetails(NEXT_SUNDAY, [0])]) },
    });
    const root = directory("root", "voronoi", [
      directory("branch", "voronoi", [early]),
      late,
    ]);

    const stats = gatherGlobalStats(minimalPolyglotData(root, { git: true }));

    expect(stats.earliest).toBe(SUNDAY);
    expect(stats.latest).toBe(NEXT_SUNDAY);
  });

  // A file's own dates are sorted so the ends of the list can be taken as its earliest and
  // latest. That sort has to be numeric: under the default (lexicographic) one these three land
  // in the order 1500000000, 2000000000, 999999999, so taking the ends silently loses the real
  // maximum from the middle. Every real timestamp is currently 10 digits, where lexicographic
  // and numeric order happen to agree - these differ in length so they don't.
  test("compares dates numerically, not as strings", () => {
    const node = minimalFileNode("f", "f", {
      data: {
        git: minimalGitData([
          gitDetails(1500000000, [0]),
          gitDetails(2000000000, [0]),
          gitDetails(999999999, [0]),
        ]),
      },
    });
    const root = directory("root", "voronoi", [node]);

    const stats = gatherGlobalStats(minimalPolyglotData(root, { git: true }));

    expect(stats.earliest).toBe(999999999);
    expect(stats.latest).toBe(2000000000);
  });

  test("ignores a file with git data but no commits in it", () => {
    const noHistory = minimalFileNode("f", "f", {
      data: { git: minimalGitData([]) },
    });
    const root = directory("root", "voronoi", [noHistory]);

    const stats = gatherGlobalStats(minimalPolyglotData(root, { git: true }));

    expect(stats.earliest).toBeUndefined();
    expect(stats.latest).toBeUndefined();
  });

  test("uses file_stats dates when the scan has no git data", () => {
    const node = minimalFileNode("f", "f", {
      data: { file_stats: { created: SUNDAY, modified: NEXT_SUNDAY } },
    });
    const root = directory("root", "voronoi", [node]);

    const stats = gatherGlobalStats(
      minimalPolyglotData(root, { file_stats: true })
    );

    expect(stats.earliest).toBe(SUNDAY);
    expect(stats.latest).toBe(NEXT_SUNDAY);
  });

  test("reports the deepest nesting and the largest file", () => {
    const root = directory("root", "voronoi", [
      directory("a", "voronoi", [
        directory("b", "voronoi", [file("deep")]),
        file("shallow"),
      ]),
    ]);

    const stats = gatherGlobalStats(minimalPolyglotData(root));

    expect(stats.maxDepth).toBe(3);
    expect(stats.maxLoc).toBe(2); // DUMMY_LOC's `code`
  });
});

describe("gatherTimescaleData", () => {
  test("buckets git commits into the week that contains them, starting on a Sunday", () => {
    const node = minimalFileNode("f", "f", {
      data: {
        git: minimalGitData([
          gitDetails(SUNDAY, [0], { commits: 1, lines_added: 10 }),
          gitDetails(MONDAY, [0], { commits: 2, lines_added: 20 }),
          gitDetails(NEXT_SUNDAY, [0], { commits: 4, lines_added: 40 }),
        ]),
      },
    });
    const root = directory("root", "voronoi", [node]);

    const timescale = gatherTimescaleData(
      minimalPolyglotData(root, { git: true }),
      "week"
    );

    // the Sunday and the Monday after it fall in one bucket; the following Sunday starts another
    expect(timescale.length).toBe(2);
    expect(timescale[0]!.commits).toBe(3);
    expect(timescale[0]!.lines_added).toBe(30);
    expect(timescale[1]!.commits).toBe(4);
  });

  test("buckets file_stats modification dates by week too, for scans with no git", () => {
    const mondayFile = minimalFileNode("a", "a", {
      data: { file_stats: { created: SUNDAY, modified: MONDAY } },
    });
    const sundayFile = minimalFileNode("b", "b", {
      data: { file_stats: { created: SUNDAY, modified: SUNDAY } },
    });
    const nextWeekFile = minimalFileNode("c", "c", {
      data: { file_stats: { created: SUNDAY, modified: NEXT_SUNDAY } },
    });
    const root = directory("root", "voronoi", [
      mondayFile,
      sundayFile,
      nextWeekFile,
    ]);

    const timescale = gatherTimescaleData(
      minimalPolyglotData(root, { file_stats: true }),
      "week"
    );

    expect(timescale.length).toBe(2);
    expect(timescale[0]!.files).toBe(2);
    expect(timescale[1]!.files).toBe(1);
  });

  test("buckets a timestamp into the same UTC week whatever the machine's timezone", () => {
    // The scanner's timestamps are day-aligned UTC, so the week a commit lands in must not
    // depend on where the person reading the visualisation happens to be. This is the assertion
    // that fails with date-fns's local-time `startOfWeek`: in `America/New_York` it bucketed to
    // 2019-04-07T04:00:00Z, and in `Europe/London` to 2019-04-06T23:00:00Z - neither of which is
    // a week boundary anywhere.
    const node = minimalFileNode("f", "f", {
      data: {
        // Tuesday 2019-04-09, 00:00 UTC
        git: minimalGitData([gitDetails(1554768000, [0])]),
      },
    });
    const root = directory("root", "voronoi", [node]);

    const bucketStartsByZone = [
      "Europe/London",
      "America/New_York",
      "Australia/Sydney",
    ].map((timeZone) => {
      vi.stubEnv("TZ", timeZone);
      try {
        const timescale = gatherTimescaleData(
          minimalPolyglotData(root, { git: true }),
          "week"
        );
        return timescale[0]!.day.getTime();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    // Sunday 2019-04-07, 00:00 UTC - the same instant in all three zones
    expect(bucketStartsByZone).toEqual([
      1554595200000, 1554595200000, 1554595200000,
    ]);
  });

  test("buckets dates that fall around calendar quirks onto the right Sunday", () => {
    // The bucketing is integer arithmetic on whole days, which needs no special case for any of
    // these - unix time is 86400 seconds per day by definition. That is exactly why they are
    // worth pinning: it would be easy to "fix" this back into something month-aware that does.
    const quirkyDays = [
      "2000-02-29", // a leap day, in a century year that *is* a leap year
      "2016-12-31", // the day a real leap second was inserted
      "2024-02-29", // an ordinary leap day
      "2100-02-28", // a century year that is *not* a leap year
    ];
    const node = minimalFileNode("f", "f", {
      data: {
        git: minimalGitData(
          quirkyDays.map((day) =>
            gitDetails(Date.parse(`${day}T00:00:00Z`) / 1000, [0])
          )
        ),
      },
    });
    const root = directory("root", "voronoi", [node]);

    const timescale = gatherTimescaleData(
      minimalPolyglotData(root, { git: true }),
      "week"
    );

    expect(timescale.map((d) => d.day.toISOString())).toEqual([
      "2000-02-27T00:00:00.000Z",
      "2016-12-25T00:00:00.000Z",
      "2024-02-25T00:00:00.000Z",
      "2100-02-28T00:00:00.000Z",
    ]);
  });

  test("returns buckets in date order", () => {
    const node = minimalFileNode("f", "f", {
      data: {
        git: minimalGitData([
          gitDetails(NEXT_SUNDAY, [0]),
          gitDetails(SUNDAY, [0]),
        ]),
      },
    });
    const root = directory("root", "voronoi", [node]);

    const timescale = gatherTimescaleData(
      minimalPolyglotData(root, { git: true }),
      "week"
    );

    expect(timescale.map((d) => d.day.getTime())).toEqual([
      ...timescale.map((d) => d.day.getTime()),
    ]);
    expect(timescale[0]!.day.getTime()).toBeLessThan(
      timescale[1]!.day.getTime()
    );
  });
});

describe("countLanguagesIn", () => {
  function fileOfLanguage(name: string, language: string, code: number) {
    return minimalFileNode(name, name, {
      data: {
        loc: {
          language,
          binary: false,
          blanks: 0,
          code,
          comments: 0,
          lines: code,
          bytes: code,
        },
      },
    });
  }

  test("ranks languages by lines of code, counting files as it goes", () => {
    const root = directory("root", "voronoi", [
      fileOfLanguage("a.rs", "Rust", 10),
      fileOfLanguage("b.rs", "Rust", 20),
      fileOfLanguage("c.ts", "TypeScript", 100),
    ]);

    const { languageKey, languageMap } = countLanguagesIn(
      minimalPolyglotData(root)
    );

    expect(languageKey.map((k) => k.language)).toEqual(["TypeScript", "Rust"]);
    expect(languageMap.get("Rust")).toMatchObject({ count: 2, loc: 30 });
  });

  // There are only ten scheme colours, so the eleventh language onwards shares `otherColour` and
  // drops off the key rather than being given a colour that repeats an earlier one.
  test("gives languages past the colour scheme the shared 'other' colour", () => {
    const root = directory(
      "root",
      "voronoi",
      // descending sizes so the ranking is unambiguous
      Array.from({ length: 12 }, (_unused, index) =>
        fileOfLanguage(`f${index}`, `lang${index}`, 100 - index)
      )
    );

    const { languageKey, languageMap, otherColour } = countLanguagesIn(
      minimalPolyglotData(root)
    );

    expect(languageKey.length).toBe(10);
    expect(languageMap.get("lang10")!.colour).toBe(otherColour);
    expect(languageMap.get("lang11")!.colour).toBe(otherColour);
  });
});

describe("postprocessUsers", () => {
  test("replaces missing names and emails with empty strings", () => {
    expect(postprocessUsers([{ id: 1, user: {} }])).toEqual([
      { id: 1, name: "", email: "" },
    ]);
  });

  // Names and emails are later joined with a tab to make a map key, so a tab surviving inside
  // either half would let two different users collide on one key.
  test("replaces every tab in a name, not just the first", () => {
    const users = postprocessUsers([
      { id: 1, user: { name: "a\tb\tc", email: "d\te" } },
    ]);

    expect(users[0]!.name).not.toContain("\t");
    expect(users[0]!.email).not.toContain("\t");
  });

  it("returns nothing for a data file with no user list", () => {
    expect(postprocessUsers(undefined)).toEqual([]);
  });
});

describe("indexUsersById", () => {
  it("indexes each user by their id", () => {
    const alice = { id: 0, name: "Alice", email: "alice@example.com" };
    const bob = { id: 1, name: "Bob", email: "bob@example.com" };

    const byId = indexUsersById([alice, bob]);

    expect(byId.get(0)).toBe(alice);
    expect(byId.get(1)).toBe(bob);
    expect(byId.size).toBe(2);
  });

  // Alias ids are allocated from `users.length` upward, so a gap in the real ids means the first
  // alias silently collides with a real user. Refusing the file on load says so, instead of
  // letting it surface later as a mis-attributed commit or an "Invalid user id" from inside the
  // Inspector - which is exactly how building the `nested.json` fixture broke it.
  it("refuses a sparse user list, naming the position and the id that disagree", () => {
    const users = [
      { id: 0, name: "Alice", email: "alice@example.com" },
      { id: 7, name: "Bob", email: "bob@example.com" },
    ];

    expect(() => indexUsersById(users)).toThrowError(
      /position 1 in the data file has id 7/
    );
  });

  it("accepts an empty user list", () => {
    expect(indexUsersById([]).size).toBe(0);
  });
});
