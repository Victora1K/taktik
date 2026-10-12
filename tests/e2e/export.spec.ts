import { readFile, stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createTactic, dragToken, expectEventually, getState, tokenId } from "./helpers";

async function openExport(page: import("@playwright/test").Page, item: string | RegExp) {
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("exports a PNG snapshot", async ({ page }) => {
  await createTactic(page, "basketball");
  const download = page.waitForEvent("download");
  await openExport(page, "Snapshot (PNG)");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  expect((await stat(await file.path())).size).toBeGreaterThan(10_000);
});

test("round-trips a tactic through a JSON file", async ({ page }) => {
  await createTactic(page, "volleyball");
  const download = page.waitForEvent("download");
  await openExport(page, "Tactic file (JSON)");
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.taktik\.json$/);
  const exported = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(exported.format).toBe("taktik");
  const ids = Object.keys(exported.state.tokens);
  expect(ids.length).toBe(Object.keys((await getState(page)).tokens).length);

  // Import a trimmed copy and confirm the replace prompt.
  delete exported.state.tokens[ids[0]];
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Export" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import tactic file" }).click();
  await (
    await chooser
  ).setFiles({
    name: "t.taktik.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (n) => n === ids.length - 1,
  );

  // Undo restores the previous content.
  await page.keyboard.press("Control+z");
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (n) => n === ids.length,
  );
});

test("rejects files that are not tactics", async ({ page }) => {
  await createTactic(page, "soccer");
  await page.getByRole("button", { name: "Export" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import tactic file" }).click();
  await (
    await chooser
  ).setFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText("This file is not a Taktik tactic")).toBeVisible();
});

test("exports the animation as a video", async ({ page }) => {
  await createTactic(page, "basketball");
  await page.getByLabel("Clip length in seconds").fill("2");
  const id = await tokenId(page, "home", "1");
  await page.getByTestId("record").click();
  await dragToken(page, id, 80, 0, 10, 30);
  await page.getByTestId("record").click();
  await page.getByLabel("Clip length in seconds").fill("2");

  const download = page.waitForEvent("download", { timeout: 20_000 });
  await openExport(page, /Animation video/);
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  expect((await stat(await file.path())).size).toBeGreaterThan(2_000);
});
