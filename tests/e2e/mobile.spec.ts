import { devices, expect, test } from "@playwright/test";
import { createTactic, expectEventually, tokenClient, tokenId } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

test.use({ ...devices["Pixel 7"] });

test("editor fits the screen and the side panel toggles", async ({ page }) => {
  await createTactic(page, "soccer");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("play")).toBeVisible();
  await expect(page.getByTestId("record")).toBeVisible();

  await page.getByRole("button", { name: "Toggle side panel" }).click();
  await expect(page.getByRole("tab", { name: "Comments" })).toBeVisible();
});

test("tap selects a player", async ({ page }) => {
  await createTactic(page, "volleyball");
  const id = await tokenId(page, "home", "1");
  const p = await tokenClient(page, id);
  await page.touchscreen.tap(p.x, p.y);
  await expectEventually(
    () => page.evaluate(() => (window as any).__taktik.editor.getState().selectedTokens as string[]),
    (sel) => sel.length === 1 && sel[0] === id,
  );
});
