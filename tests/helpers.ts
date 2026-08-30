import { expect, Page } from "@playwright/test";

// Shared by both screenshot projects - the `chromium` one against the shipped `circlePack`
// sample, and `chromium-nested` against the `nestedCircles` fixture. Both drive the same UI, so
// the only thing that differs between them is which data file the dev server was started with.

export async function gotoLoaded(page: Page, dataName: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: dataName })).toBeVisible();
  // let the D3 canvas settle before screenshotting
  await page.waitForTimeout(250);
}

export async function selectVisualization(page: Page, title: string) {
  await page.getByLabel("Visualization:").selectOption({ label: title });
  await page.waitForTimeout(250);
}

export async function selectSubVisualization(page: Page, title: string) {
  await page.getByLabel("Sub-visualisation:").selectOption({ label: title });
  await page.waitForTimeout(250);
}

export async function expandPanel(page: Page, title: string) {
  await page
    .getByRole("heading", { name: new RegExp(`^${title} show$`) })
    .getByRole("button", { name: "show" })
    .click();
}

// The "Colours and Lines" heading text matches both the outer "advanced settings" panel (as an
// ancestor) and this panel itself - go straight to this heading's own parent.
export function coloursAndLinesPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Colours and Lines" })
    .locator("xpath=..");
}

// Lives inside the collapsed "advanced settings" panel, which this opens on the way.
export async function selectDepth(page: Page, depth: number) {
  await expandPanel(page, "advanced settings");
  await page
    .getByLabel("Display maximum depth:")
    .selectOption({ label: String(depth) });
  // a debounced `expensiveConfig` change - it re-triangulates and re-uploads the whole tree
  await page.waitForTimeout(750);
}

// react-aria's NumberField labels its wrapper, its group and its input alike, so `getByLabel`
// alone is ambiguous. Its input is a `type="text"` one carrying `aria-roledescription`, so the
// role that picks out the single editable control is textbox, not spinbutton.
export function lineWidthField(page: Page, label: string) {
  return coloursAndLinesPanel(page).getByRole("textbox", { name: label });
}

// Selects a directory by name from the inspector's "Subdirectories" list. Unlike clicking the
// canvas this addresses a real DOM button, so it lands on a known node - the way CLAUDE.md
// describes directories still being reachable since picking started always returning leaves.
export async function selectSubdirectory(page: Page, name: string) {
  await page
    .locator(".SelectionNavigator")
    .getByRole("button", { name, exact: true })
    .click();
  await page.waitForTimeout(250);
}

// Selecting a specific node means clicking the WebGL canvas at a pixel position - there is no DOM
// element per cell to query or click. The layout is deterministic (polygons come from the data
// file), so a fixed offset within the canvas works - but rather than hardcode one that only holds
// for today's fixture, try a grid of offsets and keep the "retry until the inspector shows a file"
// loop as the safety net, since a fixed point could land on a directory cell (truncated at the
// depth limit, and rendered flat exactly like a file) instead of a leaf file.
export async function selectAFileNode(page: Page) {
  const canvas = page.locator("canvas.chart-gl");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("chart-gl canvas not found");
  }

  const steps = 8;
  for (let iy = 1; iy < steps; iy++) {
    for (let ix = 1; ix < steps; ix++) {
      const x = box.x + (box.width * ix) / steps;
      const y = box.y + (box.height * iy) / steps;
      await page.mouse.click(x, y);
      await page.waitForTimeout(100);
      if (await page.getByText(/^File type:/).isVisible()) {
        return;
      }
    }
  }
  throw new Error("Could not find a clickable file node in the rendered tree");
}
