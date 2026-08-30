import { expect, Page, test } from "@playwright/test";

import {
  coloursAndLinesPanel,
  expandPanel,
  gotoLoaded,
  selectAFileNode,
  selectSubVisualization,
  selectVisualization,
} from "./helpers";

// The 10-shot core screenshot set, against the shipped `circlePack` sample - see CLAUDE.md.
// These are a review aid, not a pass/fail gate (re-baseline with `npm run e2e:update` after a
// deliberate change). `nested-screenshots.spec.ts` covers the `nestedCircles` layout.

function loaded(page: Page) {
  return gotoLoaded(page, "sample");
}

test.describe("screenshots", () => {
  test("1 - initial load, full page", async ({ page }) => {
    await loaded(page);
    await expect(page).toHaveScreenshot("01-initial-load.png");
  });

  test("2 - lines of code (voronoi canvas)", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Lines of Code");
    await expect(page.locator(".Viz")).toHaveScreenshot("02-lines-of-code.png");
  });

  test("3 - indentation, worst indentation (p99)", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Indentation");
    await selectSubVisualization(page, "Worst indentation");
    await expect(page.locator(".Viz")).toHaveScreenshot(
      "03-indentation-p99.png"
    );
  });

  test("4 - age", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Age of last change");
    await expect(page.locator(".Viz")).toHaveScreenshot("04-age.png");
  });

  test("5 - churn, lines per day", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Churn");
    await selectSubVisualization(page, "Lines per day");
    await expect(page.locator(".Viz")).toHaveScreenshot("05-churn-lines.png");
  });

  test("6 - team", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Top Team");
    await expect(page.locator(".Viz")).toHaveScreenshot("06-team.png");
  });

  test("7 - file node selected, inspector open", async ({ page }) => {
    await loaded(page);
    await selectAFileNode(page);
    await expect(page.locator(".Inspector")).toHaveScreenshot(
      "07-file-selected.png"
    );
  });

  test("8 - colours and lines panel expanded", async ({ page }) => {
    await loaded(page);
    await expandPanel(page, "advanced settings");
    await expandPanel(page, "Colours and Lines");
    await expect(coloursAndLinesPanel(page)).toHaveScreenshot(
      "08-colours-and-lines.png"
    );
  });

  test("9 - colour picker popover open", async ({ page }) => {
    await loaded(page);
    await expandPanel(page, "advanced settings");
    await expandPanel(page, "Colours and Lines");
    // the popover is `position: absolute`, so it doesn't enlarge its `.picker`
    // parent's box - screenshot the whole panel so the popover isn't clipped.
    const panel = coloursAndLinesPanel(page);
    await panel.locator(".picker .swatch").first().click();
    await expect(panel.locator(".popover")).toBeVisible();
    await expect(panel).toHaveScreenshot("09-colour-picker-popover.png");
  });

  test("10 - initial load, light theme", async ({ page }) => {
    await loaded(page);
    await page.getByRole("button", { name: "Light theme" }).click();
    // clicking the theme button (near the bottom of the sidebar) auto-scrolls it into
    // view - scroll back so this shot is framed the same as shot 1.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot("10-initial-load-light.png");
  });
});
