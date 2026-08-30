import { expect, Page, test } from "@playwright/test";

import {
  expandPanel,
  gotoLoaded,
  lineWidthField,
  selectDepth,
  selectSubdirectory,
  selectVisualization,
} from "./helpers";

// Screenshots against `data/nested.json`, a `nestedCircles` layout - circle packing recurses, so
// circle depth varies per branch: the root, then the three circle-packed groups (`nesteda`,
// `nestedc`, `nesteds`), then the repos inside those - while the ten plain voronoi repos
// alongside them stop one level earlier. The shipped sample is `circlePack`, which puts circles
// at the top level only, so nothing in `screenshots.spec.ts` renders any of this.
//
// Each shot below is here to make one specific thing visible, not for coverage's sake. Like the
// core set, these are a review aid rather than a pass/fail gate.

function loaded(page: Page) {
  return gotoLoaded(page, "nested");
}

test.describe("nested circles screenshots", () => {
  // The regression this fixture exists for: a circle full of packed circles has nothing tiling
  // its boundary, so if circle-packed nodes are dropped from the outline set the whole group
  // silently vanishes rather than failing. Every nesting depth's boundary should be visible.
  test("1 - initial load, circle boundaries at every nesting depth", async ({
    page,
  }) => {
    await loaded(page);
    await expect(page).toHaveScreenshot("n01-initial-load.png");
  });

  // Truncating the tree replaces file cells with directory cells. The circles are drawn by the
  // layout rather than tiled by their children, so they must survive the truncation intact.
  test("2 - depth limited to 3", async ({ page }) => {
    await loaded(page);
    await selectDepth(page, 3);
    await expect(page.locator(".Viz")).toHaveScreenshot("n02-depth-3.png");
  });

  // "Top level width" is nesting level 0, which `outlineLevel` gives to *every* circle however
  // deeply the packing nests - so this should thicken every circle boundary at once, from the
  // root down to the repos nested inside the circle-packed groups, and nothing else. It is also
  // the `setLines` path, which updates shader uniforms without touching a buffer.
  test("3 - top level line width increased", async ({ page }) => {
    await loaded(page);
    await expandPanel(page, "advanced settings");
    await expandPanel(page, "Colours and Lines");
    const width = lineWidthField(page, "Top level width");
    await width.fill("6");
    await width.blur();
    await page.waitForTimeout(250);
    await expect(page.locator(".Viz")).toHaveScreenshot(
      "n03-thick-circle-outlines.png"
    );
  });

  // A visualisation switch is a colour-buffer-only update; this proves it lands correctly over a
  // tree whose circle-packed nodes take their fill from an override rather than the scale.
  test("4 - lines of code", async ({ page }) => {
    await loaded(page);
    await selectVisualization(page, "Lines of Code");
    await expect(page.locator(".Viz")).toHaveScreenshot(
      "n04-lines-of-code.png"
    );
  });

  // The selection stroke is the other place that offsets depth by `circleAncestors`, and it sits
  // one level shallower than the nesting strokes - a relationship that only shows up in a tree
  // where circle depth actually varies. Navigated by name through the inspector's subdirectory
  // buttons rather than by clicking the canvas: `nesteda` is a circle-packed group and `ade` is a
  // circle inside it, so this lands on a known node instead of whichever one a pixel happens to
  // hit.
  test("5 - directory selected inside a nested circle", async ({ page }) => {
    await loaded(page);
    await selectSubdirectory(page, "nesteda");
    await selectSubdirectory(page, "ade");
    await expect(page.locator(".Viz")).toHaveScreenshot(
      "n05-nested-selection.png"
    );
  });

  test("6 - initial load, light theme", async ({ page }) => {
    await loaded(page);
    await page.getByRole("button", { name: "Light theme" }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot("n06-initial-load-light.png");
  });
});
