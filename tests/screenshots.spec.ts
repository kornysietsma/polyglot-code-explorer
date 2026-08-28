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

// Selecting a specific node means clicking the pre-computed D3 canvas at a pixel
// position - there's no text-based way to pick a single file, and the layout is
// deterministic because the polygons come from the data file. Try successively larger
// cells (by rendered area) until one resolves to a file rather than a directory.
async function selectAFileNode(page: Page) {
  const cells = page.locator("svg.chart path.cell");
  const count = await cells.count();
  const boxes: { index: number; area: number }[] = [];
  for (let i = 0; i < count; i++) {
    const box = await cells.nth(i).boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      boxes.push({ index: i, area: box.width * box.height });
    }
  }
  boxes.sort((a, b) => a.area - b.area);

  for (const { index } of boxes) {
    await cells.nth(index).click({ force: true });
    await page.waitForTimeout(100);
    if (await page.getByText(/^File type:/).isVisible()) {
      return;
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
