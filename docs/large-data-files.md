# Loading data files bigger than half a gigabyte

Written 2026-08-31, when the question came up of whether the 512 MB refusal in `Loader.tsx`
could be lifted by streaming the JSON instead of reading it into one string. Nothing here has
been implemented — this is the shape of the problem, measured rather than guessed, and the
options, so the next person doesn't start from the same blank page.

## Where the limit comes from today

`Loader.tsx` refuses a data file whose `Content-Length` exceeds `MAX_DATA_FILE_BYTES`
(536,870,888). That number is V8's `String::kMaxLength` on 64-bit — not a policy choice.
`response.json()` decodes the whole body to a single string before parsing it, and a string
longer than that cannot exist, however much heap is free.

The guard exists so that an impossible file fails with a sentence, up front, before hundreds
of megabytes are downloaded — rather than throwing `RangeError: Invalid string length` somewhere
deep inside the fetch.

## But the string cap is not the wall you hit next

Measured on `data/spring-projects.json` — 514 MB, 80,691 nodes — under Node 64-bit (same V8 as
Chrome), on a warm page cache:

| step                      | cost                             |
| ------------------------- | -------------------------------- |
| decode bytes → string     | 949 ms                           |
| `JSON.parse`              | 4,954 ms                         |
| heap after parse, post-GC | 1,794 MB heapUsed / 2,483 MB RSS |
| full structural byte scan | 1,560 ms (see "Option B" below)  |

Subtract the still-referenced 514 MB string and **the parsed object tree alone is about 1.28 GB
— roughly 2.5× the size of the JSON text**. On top of that, `preprocess` then adds `parent` and
`circleAncestors` to every node and builds `nodesByPath`, `usersById` and the timescale buckets.

A Chrome tab tops out somewhere around 4 GB of heap. So lifting the string cap moves the ceiling
to roughly **1.2–1.5 GB of JSON** — about 2.5× more than today — and the failure mode past that
is an out-of-memory tab kill, which browsers handle very much worse than an error message.

Two things follow from this, and they shape everything below:

1. Any option that only removes the string cap buys one multiple of headroom, not an open end.
2. The only thing that removes the ceiling is not building the object tree in the first place.

**A discrepancy worth resolving before trusting any headroom estimate.** The comment on
`MAX_DATA_FILE_BYTES` in `Loader.tsx` records this same file as "using 508 MB of a 4.4 GB heap",
which is ~3.5× below the tree size measured here. Either that reading was taken before the parse
completed, or it measured something narrower than `heapUsed`. Re-measure in Chrome before
planning against either figure.

### Reproducing the measurements

Read the file with `fs.readFileSync`, time `buf.toString("utf8")` and `JSON.parse` separately,
then `global.gc()` and read `process.memoryUsage()`. Run under
`node --max-old-space-size=12000 --expose-gc`; the default heap is too small to hold the tree,
and without `--expose-gc` the heap reading includes garbage from the parse.

## The options

### Option A — a pure streaming JSON parser

Feed `response.body` through a tokenizer that emits values as bytes arrive, so no single string
is ever built.

`stream-json` is the library usually reached for, but it is shaped around Node streams and is
awkward against a `fetch` `ReadableStream`. The browser-native equivalent is
`@streamparser/json`, with `@streamparser/json-whatwg` giving a `TransformStream` that plugs
straight into `response.body.pipeThrough(...)`.

- **Removes** the string cap cleanly, with modest code in `Loader.tsx`.
- **Costs** speed: the tokenizer is JavaScript, where `JSON.parse` is V8's own C++. Budget
  **5–10× the measured 4,954 ms**, so 30–60 seconds of parsing for a file this size, on top of
  the download.
- **Gives** progress reporting for free, which for a half-gigabyte load is a real improvement
  over the current silence.
- **Loses** the up-front refusal: there is no longer a size you can name and reject before
  reading the body. You would be trading a clear error for an OOM.

### Option B — structural byte-split, then native `JSON.parse` per subtree

A middle path that keeps V8 doing the parsing. Scan the incoming bytes tracking only container
depth and string/escape state; whenever a complete subtree has accumulated and is under some
threshold, `TextDecoder` that slice and hand it to native `JSON.parse`, then stitch the results
into the tree.

This is cheap because the scan is trivial work per byte: **a full structural scan of all 514 MB
took 1,560 ms**, against 4,954 ms for the parse itself. Expect something like 1.3–1.5× the
native cost, rather than Option A's 5–10×. Slicing accumulated `Uint8Array` chunks is safe
because UTF-8 is self-synchronising and every structural character is ASCII — but the scanner
must still track whether it is inside a string and whether the previous byte was a backslash.

**The catch, which is the actual work.** A single-level split is not enough.
`spring-projects.json`'s `tree.children` holds 71 top-level repos, but the largest of them is
**345 MB on its own** — still far over the string cap. So the splitter has to recurse into any
child that is itself too big, which means maintaining a container stack and a size threshold,
which is most of a streaming tokenizer with the leaf work delegated to `JSON.parse`.

### Option C — change the wire format

This is the option that is actually worth doing, and the only one that addresses the 1.28 GB
object tree rather than just the 512 MB string. It is also the biggest, because the format is
shared: the Scanner writes it, `polyglot-code-offline-layout` reads it and writes it back with
layout attached, and the Explorer reads it. All three move together.

It splits into two steps, and they can land separately.

**C1 — line-delimited JSON (NDJSON).** An envelope line carrying version, features and metadata,
then one line per node, each node naming its parent by path. The Explorer reads
`response.body`, splits on newlines, and calls native `JSON.parse` once per line.

- No tokenizer to write and no library to add — the split is `indexOf("\n")` over decoded chunks.
- Full native parse speed, because every individual line is tiny.
- No string cap at all: the largest string is one node.
- Progress reporting is free and honest — you know how many bytes of how many you have consumed.
- Reassembling the tree costs a `Map` from path to node, which the Explorer effectively builds
  already in `gatherNodesByPath`.
- **Does not reduce heap.** The object tree is the same 2.5× multiple, so this alone moves the
  ceiling to ~1.2–1.5 GB and no further.

**C2 — a columnar payload for the bulk arrays.** The per-node numeric data — `loc`,
`indentation`, `file_stats`, the git day/commit/line series, coupling buckets — is where the
volume is, and it is uniform. Written as typed-array columns (custom binary, or Arrow if a
dependency is acceptable) it lands in the browser as `Float32Array`/`Int32Array` with **no
per-node JavaScript objects at all** and effectively no parse step.

This is the one option with no ceiling in sight, and it fits what the Explorer already does:
`src/webgl/geometry.ts` immediately flattens the tree into typed arrays for the GPU, so a large
part of that 1.28 GB of objects exists only to be walked once and discarded. Going columnar
deletes that round trip rather than optimising it.

The natural staging is C1 first — it is small, it is a strict improvement, and an envelope-plus-
records format leaves the door open for a record to reference a binary column block later.

**On the cost of historical data files, which is lower than it looks.** The Explorer's version
check is `semver.satisfies(data.version, SUPPORTED_FILE_VERSION)` with a bare version as the
range, which means exact equality. **Every format bump already invalidates every older data
file** — a file one patch version behind does not load today. So a format change does not create
the historical-data problem; it inherits one that exists on every release, where the answer has
always been to re-scan. A converter from old JSON to the new format is therefore optional rather
than a precondition, and would only be worth writing for files whose source repos are gone.

Note also that published sites are unaffected: a build bakes in its one data file
(`copyDataFile` in `vite.config.ts`), so anything already deployed keeps working with the
Explorer version it shipped with.

Regenerating `data/default.json` is on the follow-up list already, for unrelated reasons
(it cannot demonstrate coupling); a format change would fold that in.

### Option D — don't load the whole file

Split the data at the repo boundary and load a subtree only when it is opened. The only option
with no ceiling that does not require a new format, and the largest change to the app: the
tree, the global stats, the timescale and the team aggregation all currently assume the whole
tree is in memory.

Worth keeping in mind as the endgame if codebases keep growing, not as the next step.

### Option E — compression does not help

Gzip or brotli reduce transfer, not the decoded size, and it is the decoded length that hits the
string cap. Compression is worth having for download time and for nothing else here.

## A real bug in the current guard, found while writing this

`Loader.tsx` reads `Content-Length`, which is the **encoded** length. The dev middleware sets it
from `statSync` on the uncompressed file (`vite.config.ts`), so dev is accurate — but anyone
serving `dist/` from behind gzip or brotli (S3 + CloudFront, nginx with `gzip on`) will see a
value roughly 10× low. The guard passes, and the `RangeError` the guard exists to prevent comes
back.

A response with no `Content-Length` at all (chunked encoding) skips the guard entirely:
`response.headers.get()` returns `null` and `Number(null)` is `0`.

Both cases fail open, which is the right direction — a guard that wrongly refuses a loadable
file would be worse. But the promise the error message makes is not one the guard can keep in
production. Whichever option above is taken, the guard should stay and move to the new ceiling;
if it survives as-is, it deserves a comment saying it only holds when the response is served
uncompressed.

## Summary

| option                   | ceiling            | parse cost vs today | scope                          |
| ------------------------ | ------------------ | ------------------- | ------------------------------ |
| today                    | 512 MB             | 1×                  | —                              |
| A — streaming parser     | ~1.2–1.5 GB        | 5–10×               | `Loader.tsx` + a dependency    |
| B — split + native parse | ~1.2–1.5 GB        | ~1.3–1.5×           | a real chunk of new code       |
| C1 — NDJSON              | ~1.2–1.5 GB        | ~1×                 | Scanner, layout tool, Explorer |
| C2 — columnar payload    | no ceiling in view | far below 1×        | as C1, plus the data model     |
| D — lazy subtree loading | none               | ~1× per subtree     | most of the app                |

If the goal is to open the couple of files that sit just over the line, B is the cheapest thing
that works. If the goal is for the Explorer to handle large codebases, C is the answer, and the
heap — not the string cap — is the reason.
