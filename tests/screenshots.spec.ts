import { expect, Page, test } from "@playwright/test";

// The 10-shot core screenshot set - see CLAUDE.md. These are a review aid, not a
// pass/fail gate (re-baseline with `npm run e2e:update` after a deliberate change).

async function gotoLoaded(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "sample" })).toBeVisible();
  // let the D3 canvas settle before screenshotting
  await page.waitForTimeout(250);
}

async function selectVisualization(page: Page, title: string) {
  await page.getByLabel("Visualization:").selectOption({ label: title });
  await page.waitForTimeout(250);
}

async function selectSubVisualization(page: Page, title: string) {
  await page.getByLabel("Sub-visualisation:").selectOption({ label: title });
  await page.waitForTimeout(250);
}

async function expandPanel(page: Page, title: string) {
  await page
    .getByRole("heading", { name: new RegExp(`^${title} show$`) })
    .getByRole("button", { name: "show" })
    .click();
}

// Selecting a specific node means clicking the WebGL canvas at a pixel position - there is no DOM
// element per cell to query or click. The layout is deterministic (polygons come from the data
// file), so a fixed offset within the canvas works - but rather than hardcode one that only holds
// for today's fixture, try a grid of offsets and keep the "retry until the inspector shows a file"
// loop as the safety net, since a fixed point could land on a directory cell (truncated at the
// depth limit, and rendered flat exactly like a file) instead of a leaf file.
async function selectAFileNode(page: Page) {
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

test.describe("screenshots", () => {
  test("1 - initial load, full page", async ({ page }) => {
    await gotoLoaded(page);
    await expect(page).toHaveScreenshot("01-initial-load.png");
  });

  test("2 - lines of code (voronoi canvas)", async ({ page }) => {
    await gotoLoaded(page);
    await selectVisualization(page, "Lines of Code");
    await expect(page.locator(".Viz")).toHaveScreenshot("02-lines-of-code.png");
  });

  test("3 - indentation, worst indentation (p99)", async ({ page }) => {
    await gotoLoaded(page);
    await selectVisualization(page, "Indentation");
    await selectSubVisualization(page, "Worst indentation");
    await expect(page.locator(".Viz")).toHaveScreenshot(
      "03-indentation-p99.png"
    );
  });

  test("4 - age", async ({ page }) => {
    await gotoLoaded(page);
    await selectVisualization(page, "Age of last change");
    await expect(page.locator(".Viz")).toHaveScreenshot("04-age.png");
  });

  test("5 - churn, lines per day", async ({ page }) => {
    await gotoLoaded(page);
    await selectVisualization(page, "Churn");
    await selectSubVisualization(page, "Lines per day");
    await expect(page.locator(".Viz")).toHaveScreenshot("05-churn-lines.png");
  });

  test("6 - team", async ({ page }) => {
    await gotoLoaded(page);
    await selectVisualization(page, "Top Team");
    await expect(page.locator(".Viz")).toHaveScreenshot("06-team.png");
  });

  test("7 - file node selected, inspector open", async ({ page }) => {
    await gotoLoaded(page);
    await selectAFileNode(page);
    await expect(page.locator(".Inspector")).toHaveScreenshot(
      "07-file-selected.png"
    );
  });

  test("8 - colours and lines panel expanded", async ({ page }) => {
    await gotoLoaded(page);
    await expandPanel(page, "advanced settings");
    await expandPanel(page, "Colours and Lines");
    // the same heading text matches both the outer "advanced settings" panel (as an
    // ancestor) and this panel itself - go straight to this heading's own parent.
    const panel = page
      .getByRole("heading", { name: "Colours and Lines" })
      .locator("xpath=..");
    await expect(panel).toHaveScreenshot("08-colours-and-lines.png");
  });

  test("9 - colour picker popover open", async ({ page }) => {
    await gotoLoaded(page);
    await expandPanel(page, "advanced settings");
    await expandPanel(page, "Colours and Lines");
    // the popover is `position: absolute`, so it doesn't enlarge its `.picker`
    // parent's box - screenshot the whole panel so the popover isn't clipped.
    const panel = page
      .getByRole("heading", { name: "Colours and Lines" })
      .locator("xpath=..");
    await panel.locator(".picker .swatch").first().click();
    await expect(panel.locator(".popover")).toBeVisible();
    await expect(panel).toHaveScreenshot("09-colour-picker-popover.png");
  });

  test("10 - initial load, light theme", async ({ page }) => {
    await gotoLoaded(page);
    await page.getByRole("button", { name: "Light theme" }).click();
    // clicking the theme button (near the bottom of the sidebar) auto-scrolls it into
    // view - scroll back so this shot is framed the same as shot 1.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot("10-initial-load-light.png");
  });
});
