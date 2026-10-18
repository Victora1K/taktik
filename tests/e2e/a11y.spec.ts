import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createTactic, expectEventually, getState, tokenClient, tokenId } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The Konva canvas is a single bitmap; its contents are exposed through the side panels instead.
    .exclude("[data-testid=board] canvas")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map(
    (v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
  );
  expect(report, report.join("\n\n")).toEqual([]);
}

test("landing page", async ({ page }) => {
  await page.goto("/");
  await audit(page);
});

test("legal pages", async ({ page }) => {
  await page.goto("/terms");
  await audit(page);
  await page.goto("/privacy");
  await audit(page);
});

test("team library", async ({ page }) => {
  await page.goto("/teams");
  await page.waitForURL(/\/teams\/[^/]+$/);
  await expect(page.getByTestId("new-tactic")).toBeVisible();
  await audit(page);
  await page.getByTestId("new-tactic").click();
  await expect(page.getByTestId("create-tactic")).toBeVisible();
  await audit(page);
});

test("editor and its panels", async ({ page }) => {
  await createTactic(page, "basketball");
  await audit(page);
  for (const tab of ["Players", "Layers", "Comments"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await audit(page);
  }
});

test("keyboard: arrows nudge the selection and Space activates focused buttons", async ({ page }) => {
  await createTactic(page, "volleyball");
  const id = await tokenId(page, "home", "1");
  const p = await tokenClient(page, id);
  await page.mouse.click(p.x, p.y);
  const before = (await getState(page)).tokens[id];
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expectEventually(
    async () => (await getState(page)).tokens[id].y,
    (y) => Math.abs(y - (before.y + 2)) < 0.001,
  );
  const after = (await getState(page)).tokens[id];
  expect(after.x).toBeCloseTo(before.x + 0.5, 3);
  expect(after.y).toBeCloseTo(before.y + 2, 3);

  await page.getByRole("tab", { name: "Layers", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => (window as any).__taktik.playback.getState().playing)).toBe(false);
});

test("public player", async ({ page, context }) => {
  await createTactic(page, "soccer");
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByTestId("public-link-toggle").check();
  const url = await page.getByTestId("public-link").inputValue();
  const viewer = await context.newPage();
  await viewer.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(viewer.getByTestId("board")).toBeVisible();
  await audit(viewer);
});
