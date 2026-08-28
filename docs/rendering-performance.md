# Rendering performance: why the Explorer is slow on big codebases, and what to do

Written 2026-08-28, after a fresh investigation prompted by the dependency upgrade
in 0.7.0. The slowness is not new and the upgrade did not cause it - this is a
record of what was actually measured, so the next person (or the next me) doesn't
have to re-derive it.

## The symptom

Load a large scanner output - `spring-projects.json` is 514 MB and 80,691 nodes -
and the visualisation lags badly. Not just on interaction: simply panning or
zooming is visibly janky, in both current Firefox and current Chrome. Memory is
not the issue; Activity Monitor shows no swapping.

## What is actually on the page

For `openmrs.json` (33,931 nodes, a mid-size file chosen so experiments iterate
quickly):

- 22,209 `.cell` paths - the filled polygons, one per leaf file
- 33,675 `.nesting` paths - stroke-only outlines
- 22,209 `<title>` elements - the native hover tooltips
- **78,097 SVG elements total**, roughly 457,000 polygon vertices

`spring-projects.json` is about 3.6x that again.

Note the shape of those two numbers: there are *more* nesting paths than cells.
`nestingNodes` in `Viz.tsx` filters only on depth, so it includes leaf files, not
just directories. Every file therefore gets two paths - one filled cell, one
outline - drawn on top of each other.

Measuring precisely: **19,101 of the 33,675 nesting paths are pixel-for-pixel
identical to a `.cell` that is already being drawn** - same geometry, same stroke
colour, same stroke width. About a third of all rendered paths draw nothing new.

## The measurements

Headed Chrome, Intel UHD 630, DPR 1. Synthetic pan+zoom driving the same transform
the `d3.zoom` handler drives, 30-40 frames per run, mean frame time.

| Approach | ms/frame | fps |
|---|---|---|
| **Current: SVG `transform` attr on `<g>`** | **2222** | 0.5 |
| drop `vector-effect: non-scaling-stroke` | 1701 | 0.6 |
| hide the nesting layer entirely | 1073 | 0.9 |
| no strokes at all | 429 | 2.3 |
| `shape-rendering: optimizeSpeed` | 2443 | 0.4 (worse) |
| every SVG tweak combined | 445 | 2.2 |
| Canvas 2D, one fill per polygon | 279 | 3.6 |
| Canvas 2D, batched by colour, rebuilt per frame | 2179 | 0.5 |
| Canvas 2D, batched by colour, cached `Path2D` | 179 | 5.6 |
| **CSS `transform` on the `<svg>` element** | **16.7** | **60** |
| **WebGL, one static buffer, one draw call** | **16.6** | **60** (vsync-capped) |
| (floor: all polygons `display: none`) | 29 | 34 |

## What the numbers mean

**It is not the data size, and not memory.** It is that every pan/zoom frame
re-rasterises ~56,000 vector paths on the CPU. Setting the `transform` attribute
on a `<g>` invalidates the entire subtree, and Skia does not cache the result.

**Strokes dominate, not fills.** 2222 -> 429 ms purely by removing strokes. Stroke
cost scales with perimeter in device pixels, and `vector-effect: non-scaling-stroke`
forces per-path stroke-geometry recomputation on every transform change - about
25% on its own. The expensive strokes turn out to be the ~11k *directory*
outlines, with their long perimeters, not the 19k redundant file outlines:
deleting all 19,101 redundant paths bought only 8% of frame time.

**SVG micro-optimisation cannot fix this.** Every tweak combined still leaves you
at 445 ms - 2 fps. `shape-rendering: optimizeSpeed` actively made it worse.
Removing the 22k `<title>` elements had *zero* effect on frame time; it is a
memory and DOM-size cost, not a raster cost.

**Canvas 2D is not the answer either**, which surprised me. Best case 179 ms, only
12x better. It is CPU rasterisation too. Worth recording the trap: batching all
polygons into one `Path2D` and rebuilding it per frame is *catastrophic* (2179 ms),
because a single path with 22k subpaths has to resolve the fill rule across the
whole thing. Caching the `Path2D` is what makes batching pay.

**WebGL is a different regime entirely.** 16.6 ms median, and that is vsync - the
GPU is idle. The polygons are convex (Voronoi cells and circle approximations), so
a triangle fan is an *exact* triangulation; no earcut, no tessellation library.
The whole pipeline measured at 129 ms to triangulate 22k polygons into 282k
triangle vertices, 26 ms to upload, 5.6 MB of buffer. After that, pan and zoom is
one uniform update and one `drawArrays`. That is ~130x faster than today and it
scales to 80k nodes without effort.

## The one cheap trick that nearly works

Driving the gesture with a CSS `transform` on the `<svg>` element (rather than the
SVG `transform` attribute on the `<g>`) promotes it to a composited layer, and the
gesture becomes a GPU blit: 2127 -> 16.7 ms.

Two things to know before reaching for it:

- Chrome **re-rasterises the layer when the gesture settles**, so it ends up sharp,
  not blurry - I checked at 4x scale. But that re-raster costs the full ~1-2 s.
  So it converts "laggy throughout" into "smooth, then a freeze when you stop".
- Strokes visually scale during the gesture, because `non-scaling-stroke` is
  relative to the SVG's own user space.

Applying the CSS transform to the inner `<g>` instead is dramatically *worse*
(7257 ms) - the promotion only works on the SVG element itself. A wrapper `div`
was middling (105 ms).

It is a legitimate stopgap, and a useful thing to know about compositing. It is not
a fix.

## Caveats on all of the above

- Measured in Playwright-driven Chrome, which may rasterise differently from a
  normal browser session. The absolute numbers are probably pessimistic; the
  *ratios* and the ordering are the point.
- DPR 1. On a Retina display SVG raster cost roughly quadruples, while the WebGL
  number barely moves - so the gap in real use is likely wider, not narrower.
- Intel UHD 630. WebGL was confirmed GPU-backed (ANGLE Metal renderer), so the
  16.6 ms is a real GPU path, not a software fallback.

## Reproducing it

The benchmark scripts were throwaway - `page.evaluate` harnesses that toggle CSS
with `!important` (much faster than mutating 56k inline styles), animate the
transform across N frames, and report mean frame time. Rebuilding them is maybe
20 minutes. The important details:

- Toggle variants with an injected `<style>` using `!important`, not per-element
  style writes, or you measure your own instrumentation.
- Drive the transform every frame and measure `requestAnimationFrame` deltas.
- Hide the SVG entirely when benchmarking canvas or WebGL alternatives, or you are
  measuring both.
- Use a mid-size file. `openmrs.json` (34k nodes) reproduces the problem while
  staying fast to reload; `spring-projects.json` (80k) is the real target but
  punishing to iterate on.

Data files in `data/` are versioned and mostly stale. Bumping an old one is a
single-byte patch when the format has not actually changed - see CLAUDE.md on
`SUPPORTED_FILE_VERSION`. `1.0.4 -> 1.0.5` (commit 763f13f) was a rendering fix
with no format change, so:

```sh
printf '5' | dd of=data/openmrs.json bs=1 seek=16 conv=notrunc
```

`spring-projects.json` and `openmrs.json` have both been bumped this way.

## Where this went

See `spec.md` for the resulting design: raw WebGL, positions and colours in
separate buffers, `d3-quadtree` picking, SVG kept as a thin overlay for selection
outlines and coupling arcs.

One design point worth surfacing here because it is not obvious: the reason to
separate the position buffer from the colour buffer is that it gives three update
paths with wildly different costs - transform (a uniform, every frame), colour (a
buffer rewrite, on visualisation change), and geometry (re-triangulate, on depth
or layout change). That mirrors the existing `config` / `expensiveConfig` split in
`state.ts`, fixes a real inefficiency today (`update()` re-sets the `d` attribute
on every path even for a pure colour change), and is what would make a future
runtime re-layout cheap rather than a rewrite.
