import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string;
};

const outDir = "dist";

// The scanner data files in `data/` can run to hundreds of MB — they must never go through
// Vite's transform pipeline, so `data/` is deliberately not `publicDir`. This mounts it at
// `/data` for dev only, streaming files straight off disk; the production build's equivalent is
// the `writeBundle` copy below.
function serveDataDir(): Plugin {
  const dataDir = path.resolve(import.meta.dirname, "data");
  return {
    name: "serve-data-dir",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }
        const requestPath = (req.url ?? "").split("?")[0]!;
        const filePath = path.join(dataDir, decodeURIComponent(requestPath));
        if (!filePath.startsWith(dataDir + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let size: number;
        try {
          size = statSync(filePath).size;
        } catch (e) {
          // A missing file is routine — every data file without a `_state.json` sidecar asks
          // for one and gets a 404 — so only say something when the reason is *not* that.
          // Otherwise a permissions or path problem is indistinguishable from a normal miss.
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            console.error(`Cannot stat data file ${filePath}:`, e);
          }
          // Answer directly rather than calling next() — otherwise Vite's SPA fallback serves
          // index.html for a missing file, which breaks callers expecting a normal fetch failure.
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", size);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        // Piping without this is how a failed data load says nothing anywhere: an unhandled
        // 'error' on either end is silent here, and the browser only sees a truncated response.
        const stream = createReadStream(filePath);
        stream.on("error", (e) => {
          console.error(`Error reading data file ${filePath}:`, e);
          res.end();
        });
        res.on("error", (e) => {
          console.error(
            `Error writing data file ${filePath} to the client:`,
            e
          );
          stream.destroy();
        });
        res.on("close", () => {
          // The client went away mid-transfer — a navigation, or the tab dying under the weight
          // of the file it just asked for, which is the case this whole exercise started from.
          if (!res.writableEnded) {
            console.warn(
              `Client disconnected while sending data file ${filePath} (${size} bytes)`
            );
            stream.destroy();
          }
        });
        stream.pipe(res);
      });
    },
  };
}

// The dev middleware above serves the whole `data/` directory; a production build ships only
// the one file the app was built with, so `dist/` stays small and doesn't leak every scanner
// output the developer happens to have on disk.
function copyDataFile(): Plugin {
  const dataDir = path.resolve(import.meta.dirname, "data");
  return {
    name: "copy-data-file",
    apply: "build",
    writeBundle() {
      const dataName = process.env.EXPLORER_DATA ?? "default";
      const src = path.join(dataDir, `${dataName}.json`);
      if (!existsSync(src)) {
        throw new Error(
          `Data file not found: ${src} — set EXPLORER_DATA to the name of an existing file under data/ (without .json)`
        );
      }
      const destDir = path.resolve(import.meta.dirname, outDir, "data");
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, path.join(destDir, `${dataName}.json`));

      const stateSrc = path.join(dataDir, `${dataName}_state.json`);
      if (existsSync(stateSrc)) {
        copyFileSync(stateSrc, path.join(destDir, `${dataName}_state.json`));
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serveDataDir(), copyDataFile()],
  build: {
    outDir,
    // Single-page tool loaded once - code-splitting the d3/react-aria bundle buys nothing,
    // so raise the limit rather than see the warning on every build.
    chunkSizeWarningLimit: 1000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __EXPLORER_DATA__: JSON.stringify(process.env.EXPLORER_DATA ?? "default"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
