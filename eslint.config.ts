import js from "@eslint/js";
import type { Linter } from "eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedRules: Linter.RulesRecord = {
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error",
  "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_.*" }],
  // Deliberate convention for working with `noUncheckedIndexedAccess` — see README.md.
  "@typescript-eslint/no-non-null-assertion": "off",
};

export default defineConfig([
  globalIgnores([
    "dist",
    "data",
    "coverage",
    "test-results",
    "playwright-report",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...sharedRules,
      // This app deliberately reads refs during render to bridge imperative D3 rendering with
      // React state (see CLAUDE.md on `dataRef`/`stateRef` and why StrictMode is avoided) — the
      // React-Compiler-oriented "Rules of React" this rule enforces don't apply here.
      "react-hooks/refs": "off",
    },
  },
  {
    // Build and test tooling: Node rather than browser, and no React rules.
    files: ["tests/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: sharedRules,
  },
]);
