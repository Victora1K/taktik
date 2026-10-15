import { expect, test } from "@playwright/test";
import {
  createTactic,
  dragToken,
  expectEventually,
  fieldClient,
  getState,
  tokenClient,
  tokenId,
} from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

test("landing page links into the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Draw the play");
  await page.getByRole("link", { name: /start a tactic/i }).click();
  await page.waitForURL(/\/teams/);
});

test("creates a tactic with the selected sport and player counts", async ({ page }) => {
  await createTactic(page, "volleyball");
  const state = await getState(page);
  expect(state.meta.sport).toBe("volleyball");
  const tokens = Object.values(state.tokens) as any[];
  expect(tokens.filter((t) => t.team === "home")).toHaveLength(6);
  expect(tokens.filter((t) => t.team === "away")).toHaveLength(6);
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByLabel("Name for number 1").first()).toBeVisible();
});

test("moves a selected group together", async ({ page }) => {
  await createTactic(page, "basketball");
  const a = await tokenId(page, "home", "1");
  const b = await tokenId(page, "home", "2");
  const before = await getState(page);
  const pa = await tokenClient(page, a);
  const pb = await tokenClient(page, b);
  await page.mouse.click(pa.x, pa.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up("Shift");
  expect(await page.evaluate(() => (window as any).__taktik.editor.getState().selectedTokens.length)).toBe(2);
  await dragToken(page, a, 60, 30, 8, 10);
  const after = await getState(page);
  for (const id of [a, b]) {
    expect(after.tokens[id].x).toBeGreaterThan(before.tokens[id].x + 0.5);
    expect(after.tokens[id].y).toBeGreaterThan(before.tokens[id].y + 0.2);
  }
});

test("records a run, then layers a second run while the first replays", async ({ page }) => {
  await createTactic(page, "soccer");
  const nine = await tokenId(page, "home", "10");
  const seven = await tokenId(page, "home", "6");

  // First take: record #10's run.
  await page.getByTestId("record").click();
  await dragToken(page, nine, 160, -40);
  await page.getByTestId("record").click();
  let state = await getState(page);
  const tracks1 = Object.values(state.tracks) as any[];
  expect(tracks1).toHaveLength(1);
  expect(tracks1[0].tokenId).toBe(nine);
  expect(tracks1[0].keyframes.length).toBeGreaterThanOrEqual(2);

  // Second take: rewind and record #6 while #10's run plays back.
  await page.getByRole("button", { name: "Back to start" }).click();
  await page.getByTestId("record").click();
  await page.waitForTimeout(150);
  const tenMidRecording = await page.evaluate((id) => (window as any).__taktikBoard.positions()[id], nine);
  await dragToken(page, seven, 0, 120);
  await page.getByTestId("record").click();
  state = await getState(page);
  const tracks2 = Object.values(state.tracks) as any[];
  expect(tracks2.map((t) => t.tokenId).sort()).toEqual([nine, seven].sort());
  expect(tenMidRecording.x).not.toBe(state.tokens[nine].x);

  // Playback moves both players.
  await page.evaluate(() => (window as any).__taktik.playback.setState({ time: 700 }));
  await page.waitForTimeout(50);
  const mid = await page.evaluate(() => (window as any).__taktikBoard.positions());
  expect(mid[nine].x).toBeGreaterThan(state.tokens[nine].x);
  expect(mid[seven].y).toBeGreaterThan(state.tokens[seven].y);
});

test("records onto a new layer, and muting the layer removes the motion", async ({ page }) => {
  await createTactic(page, "basketball");
  const one = await tokenId(page, "home", "1");
  await page.getByLabel("When recording over existing motion").selectOption("layer");
  await page.getByTestId("record").click();
  await dragToken(page, one, 0, 80);
  await page.getByTestId("record").click();
  let state = await getState(page);
  expect(Object.keys(state.layers)).toHaveLength(2);
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "Mute layer" }).nth(1).click();
  await page.evaluate(() => (window as any).__taktik.playback.setState({ time: 5000 }));
  await page.waitForTimeout(50);
  state = await getState(page);
  const pos = await page.evaluate((id) => (window as any).__taktikBoard.positions()[id], one);
  expect(pos.y).toBeCloseTo(state.tokens[one].y, 1);
});

test("undo and redo a deletion", async ({ page }) => {
  await createTactic(page, "volleyball");
  const before = Object.keys((await getState(page)).tokens).length;
  const id = await tokenId(page, "away", "3");
  const p = await tokenClient(page, id);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Delete");
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (n) => n === before - 1,
  );
  await page.keyboard.press("Control+z");
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (n) => n === before,
  );
  await page.keyboard.press("Control+Shift+z");
  await expectEventually(
    async () => Object.keys((await getState(page)).tokens).length,
    (n) => n === before - 1,
  );
});

test("builds simultaneous timed routes and shifts chained phases when duration changes", async ({ page }) => {
  await createTactic(page, "soccer");
  await page.getByRole("button", { name: "Add phase" }).click();
  let state = await getState(page);
  const players = (Object.values(state.tokens) as any[])
    .filter((token) => token.team !== "ball")
    .slice(0, 2)
    .map((token) => token.id);

  for (const [index, id] of players.entries()) {
    const token = await tokenClient(page, id);
    state = await getState(page);
    const destination = await fieldClient(page, state.tokens[id].x + 5, state.tokens[id].y + index + 2);
    await page.keyboard.press("g");
    await expect(page.getByLabel("Draw timed route")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("board")).toHaveCSS("cursor", "crosshair");
    await page.mouse.click(token.x, token.y);
    await expectEventually(
      () => page.evaluate(() => (window as any).__taktik.editor.getState().selectedTokens as string[]),
      (selected) => selected[0] === id,
    );
    await page.mouse.click(destination.x, destination.y);
    await page.getByRole("button", { name: "Done route" }).click();
  }
  await expectEventually(
    async () => Object.values((await getState(page)).tracks).filter((track: any) => track.phaseId).length,
    (count) => count === 2,
  );
  state = await getState(page);
  let routes = Object.values(state.tracks).filter((track: any) => track.phaseId) as any[];
  expect(routes).toHaveLength(2);
  expect(routes.map((track) => track.keyframes.map((point: any) => point.t))).toEqual([
    [0, 3000],
    [0, 3000],
  ]);

  await page.getByRole("button", { name: "Next phase" }).click();
  const token = await tokenClient(page, players[0]);
  const destination = await fieldClient(page, state.tokens[players[0]].x + 8, state.tokens[players[0]].y + 5);
  await page.keyboard.press("g");
  await expect(page.getByLabel("Draw timed route")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("board")).toHaveCSS("cursor", "crosshair");
  await page.mouse.click(token.x, token.y);
  await page.mouse.click(destination.x, destination.y);
  await page.getByRole("button", { name: "Done route" }).click();
  await expectEventually(
    async () => Object.values((await getState(page)).tracks).filter((track: any) => track.phaseId).length,
    (count) => count === 3,
  );
  state = await getState(page);
  routes = Object.values(state.tracks).filter((track: any) => track.phaseId) as any[];
  expect(routes).toHaveLength(3);
  expect(routes.some((track) => track.keyframes[0].t === 3000 && track.keyframes.at(-1).t === 6000)).toBe(
    true,
  );

  await page.getByRole("button", { name: /Phase 1/ }).click();
  const duration = page.getByLabel("Active phase duration in seconds");
  await page.waitForTimeout(600);
  await duration.fill("5");
  await duration.press("Enter");
  await expectEventually(
    async () =>
      (Object.values((await getState(page)).phases) as any[]).some((phase) => phase.durationMs === 5000),
    Boolean,
  );
  state = await getState(page);
  const phases = (Object.values(state.phases) as any[]).sort((a, b) => a.order - b.order);
  expect(phases.map((phase) => phase.durationMs)).toEqual([5000, 3000]);
  const phaseTwo = routes.find((track) => track.phaseId === phases[1].id);
  const shifted = state.tracks[phaseTwo.id];
  expect(shifted.keyframes[0].t).toBe(5000);
  expect(shifted.keyframes.at(-1).t).toBe(8000);

  await duration.blur();
  await page.keyboard.press("Control+z");
  await expectEventually(
    async () =>
      (Object.values((await getState(page)).phases) as any[]).sort((a, b) => a.order - b.order)[0].durationMs,
    (value) => value === 3000,
  );
  await page.keyboard.press("Control+Shift+z");
  await expectEventually(
    async () =>
      (Object.values((await getState(page)).phases) as any[]).sort((a, b) => a.order - b.order)[0].durationMs,
    (value) => value === 5000,
  );
});

test("public link plays the tactic read-only", async ({ page, context }) => {
  await createTactic(page, "soccer");
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByTestId("public-link-toggle").check();
  const url = await page.getByTestId("public-link").inputValue();
  const viewer = await context.newPage();
  await viewer.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(viewer.getByTestId("board")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Record" })).toHaveCount(0);
});
