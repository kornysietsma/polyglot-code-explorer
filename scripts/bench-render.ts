// Checked-in benchmark harness for the pan/zoom frame-time investigation in
// docs/rendering-performance.md and spec.md. Unlike the throwaway scripts used for the
// initial investigation, this is meant to be re-run unchanged before and after the WebGL
// rewrite (plan.md step 0, 7 and 10), so the before/after numbers come from identical code.
//
// Usage:
//   node scripts/bench-render.ts webgl-check
//   node scripts/bench-render.ts <dataFileName> [--steps=40] [--warmup=5] [--port=5183] [--headed=true]
//
// <dataFileName> is a name under data/ (without .json), e.g. openmrs or spring-projects.
// This spawns its own `vite` dev server on a dedicated port (default 5183) so it doesn't
// collide with `npm start` (5173) or the Playwright screenshot suite's webServer (also 5173).
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

import { chromium } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");

// Playwright's headless Chromium defaults to the SwiftShader software backend on macOS,
// even when a real GPU is available - headed mode picks up the real GPU with no extra
// flags. Forcing the ANGLE Metal backend restores real GPU acceleration in headless mode
// too. Confirmed by hand (webgl-check reported SwiftShader without this, the real "ANGLE
// Metal Renderer: Intel(R) UHD Graphics 630" with it) - see plan.md step 0 progress notes.
const GPU_ARGS = process.platform === "darwin" ? ["--use-angle=metal"] : [];

interface FrameStats {
  count: number;
  meanMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}

function summarise(deltas: number[]): FrameStats {
  if (deltas.length === 0) {
    throw new Error(
      "No frame samples collected - increase --steps or reduce --warmup"
    );
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  return {
    count: deltas.length,
    meanMs: sum / deltas.length,
    medianMs: median,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
  };
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Dev server at ${url} did not become ready within ${timeoutMs}ms`
  );
}

function startVite(dataFile: string, port: number): ChildProcess {
  const viteBin = path.join(repoRoot, "node_modules", ".bin", "vite");
  const child = spawn(viteBin, ["--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env, EXPLORER_DATA: dataFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[vite] ${chunk.toString()}`);
  });
  return child;
}

async function checkWebgl(): Promise<void> {
  const browser = await chromium.launch({ args: GPU_ARGS });
  try {
    const page = await browser.newPage();
    const info = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl") ??
        canvas.getContext(
          "experimental-webgl"
        )) as WebGLRenderingContext | null;
      if (!gl) return { ok: false as const };
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = (
        dbg
          ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER)
      ) as string;
      const vendor = (
        dbg
          ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR)
      ) as string;
      return { ok: true as const, renderer, vendor };
    });
    if (!info.ok) {
      console.error(
        "WebGL context could NOT be created in Playwright's Chromium."
      );
      process.exitCode = 1;
      return;
    }
    const software = /swiftshader|software/i.test(info.renderer);
    console.log("WebGL context OK.");
    console.log(`  renderer: ${info.renderer}`);
    console.log(`  vendor:   ${info.vendor}`);
    console.log(`  backend:  ${software ? "SOFTWARE (SwiftShader)" : "GPU"}`);
  } finally {
    await browser.close();
  }
}

interface BenchOptions {
  dataFile: string;
  port: number;
  steps: number;
  warmup: number;
  headed: boolean;
}

async function runBench(options: BenchOptions): Promise<void> {
  const { dataFile, port, steps, warmup, headed } = options;
  const url = `http://localhost:${port}`;
  const vite = startVite(dataFile, port);
  try {
    await waitForServer(url, 60_000);

    const browser = await chromium.launch({
      headless: !headed,
      args: GPU_ARGS,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 300_000,
      });

      // Big data files can take a while to fetch and parse - wait generously for either the
      // real viz or the Loader's own error screen, whichever comes first, rather than one
      // long fixed sleep or a single selector that hangs the full timeout on a typo'd name.
      const outcome = await Promise.race([
        page
          .waitForSelector(".Viz", { timeout: 300_000 })
          .then(() => "viz" as const),
        page
          .waitForSelector("text=Errors loading data", { timeout: 300_000 })
          .then(() => "error" as const),
      ]);
      if (outcome === "error") {
        const message = await page.locator("ul").innerText();
        throw new Error(
          `App reported a data-loading error for '${dataFile}':\n${message}`
        );
      }

      const deltas = await page.evaluate(
        ({ steps }) => {
          const target = document.querySelector(".Viz");
          if (!target) throw new Error("no .Viz element");
          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          const frames: number[] = [];
          let sampling = true;
          let last = performance.now();
          function sample(now: number) {
            frames.push(now - last);
            last = now;
            if (sampling) requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);

          function nextFrame(): Promise<void> {
            return new Promise((resolve) =>
              requestAnimationFrame(() => resolve())
            );
          }

          async function drive() {
            // Wheel events alone exercise the same zoomed()/transform-write code path a drag
            // pan does - d3.zoom's wheel handler adjusts translate as well as scale, to hold
            // the point under the cursor fixed - without the extra complexity of simulating a
            // drag, which d3-zoom rebinds to window-level mousemove/mouseup listeners.
            for (let i = 0; i < steps; i++) {
              // target's null-check above doesn't narrow across this closure boundary.
              const el = document.elementFromPoint(cx, cy) ?? target!;
              const deltaY = i % 2 === 0 ? -120 : 120;
              el.dispatchEvent(
                new WheelEvent("wheel", {
                  clientX: cx,
                  clientY: cy,
                  deltaX: 0,
                  deltaY,
                  deltaMode: 0,
                  bubbles: true,
                  cancelable: true,
                })
              );
              await nextFrame();
            }
            sampling = false;
            await nextFrame();
          }

          return drive().then(() => frames.slice(1)); // drop the pre-gesture sample
        },
        { steps }
      );

      const used = deltas.slice(warmup);
      const stats = summarise(used);
      console.log(
        `\n${dataFile}: ${used.length} frames (of ${deltas.length}, ${warmup} warm-up discarded)`
      );
      console.log(`  mean:   ${stats.meanMs.toFixed(1)} ms/frame`);
      console.log(`  median: ${stats.medianMs.toFixed(1)} ms/frame`);
      console.log(`  min:    ${stats.minMs.toFixed(1)} ms/frame`);
      console.log(`  max:    ${stats.maxMs.toFixed(1)} ms/frame`);
    } finally {
      await browser.close();
    }
  } finally {
    vite.kill();
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (match) flags[match[1]!] = match[2] ?? "true";
  }
  return flags;
}

const usage =
  "Usage: node scripts/bench-render.ts <webgl-check|dataFileName> [--steps=40] [--warmup=5] [--port=5183] [--headed=true]";

async function main() {
  const [first, ...rest] = process.argv.slice(2);
  if (!first) throw new Error(usage);

  if (first === "webgl-check") {
    await checkWebgl();
    return;
  }

  const flags = parseFlags(rest);
  await runBench({
    dataFile: first,
    port: Number(flags.port ?? 5183),
    steps: Number(flags.steps ?? 40),
    warmup: Number(flags.warmup ?? 5),
    headed: flags.headed === "true",
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
