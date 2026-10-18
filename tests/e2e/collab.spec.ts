import { expect, test } from "@playwright/test";
import { createTactic, expectEventually, getState, tokenClient, tokenId, waitForBoard } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Local mode syncs tabs of the same browser profile, which exercises the same Yjs provider used with Supabase.
test("two editors see each other's edits, cursors and comments live", async ({ context }) => {
  const a = await context.newPage();
  const url = await createTactic(a, "basketball");
  const b = await context.newPage();
  await b.goto(url);
  await waitForBoard(b);

  const count = async (p: typeof a) => Object.keys((await getState(p)).tokens).length;
  const initial = await count(b);

  // A adds a player; B receives it.
  await a.getByRole("button", { name: "Add player" }).click();
  await expectEventually(
    () => count(b),
    (n) => n === initial + 1,
  );

  // B moves a token; A sees the new position.
  const id = await tokenId(b, "away", "1");
  const before = (await getState(a)).tokens[id];
  const p = await tokenClient(b, id);
  await b.mouse.move(p.x, p.y);
  await b.mouse.down();
  await b.mouse.move(p.x + 40, p.y + 40, { steps: 6 });
  await b.mouse.up();
  await expectEventually(
    async () => (await getState(a)).tokens[id].x,
    (x) => x > before.x + 0.3,
  );

  // Cursor presence.
  await b.mouse.move(p.x + 10, p.y + 10);
  await expectEventually(
    () => a.evaluate(() => (window as any).__taktik.editor.getState().peers.some((peer: any) => peer.cursor)),
    (v) => v === true,
  );

  // Comments propagate.
  await a.getByRole("tab", { name: "Comments" }).click();
  await b.getByRole("tab", { name: "Comments" }).click();
  await a.getByPlaceholder(/Discuss this tactic/).fill("Screen for #2 on the left elbow");
  await a.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(b.getByText("Screen for #2 on the left elbow")).toBeVisible({ timeout: 8000 });
});

test("changes persist after reload", async ({ page }) => {
  const url = await createTactic(page, "volleyball");
  const before = Object.keys((await getState(page)).tokens).length;
  await page.getByRole("button", { name: "Add ball" }).click();
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (count) => count === before + 1,
  );
  const expected = before + 1;
  await expect(page.getByTestId("save-status")).toContainText("Saved", { timeout: 10_000 });
  await page.goto(url);
  await waitForBoard(page);
  expect(Object.keys((await getState(page)).tokens).length).toBe(expected);
});
