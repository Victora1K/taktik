import { devices, expect, test } from "@playwright/test";
import { createTactic, expectEventually, fieldClient, getState, tokenClient, tokenId } from "./helpers";

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

test("finishes a timed route with the mobile completion control", async ({ page }) => {
  await createTactic(page, "soccer");
  await page.getByRole("button", { name: "Add phase" }).click();
  const id = await tokenId(page, "home", "1");
  const start = await tokenClient(page, id);
  const state = await getState(page);
  const end = await fieldClient(page, state.tokens[id].x + 5, state.tokens[id].y + 3);
  await page.getByLabel("Draw timed route").click();
  await expect(page.getByLabel("Draw timed route")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("board")).toHaveCSS("cursor", "crosshair");
  await page.touchscreen.tap(start.x, start.y);
  await expectEventually(
    () => page.evaluate(() => (window as any).__taktik.editor.getState().selectedTokens as string[]),
    (selected) => selected[0] === id,
  );
  await page.touchscreen.tap(end.x, end.y);
  await page.getByRole("button", { name: "Done route" }).click();
  await expectEventually(
    async () => Object.values((await getState(page)).tracks).filter((track: any) => track.phaseId).length,
    (count) => count === 1,
  );
});
