import { expect, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function createTactic(page: Page, sport: "soccer" | "basketball" | "volleyball") {
  await page.goto("/teams");
  await page.waitForURL(/\/teams\/[^/]+$/);
  await page.getByTestId("new-tactic").click();
  await page.getByTestId(`sport-${sport}`).click();
  await page.getByTestId("create-tactic").click();
  await page.waitForURL(/\/tactics\//);
  await waitForBoard(page);
  return page.url();
}

export async function waitForBoard(page: Page) {
  await page.waitForFunction(() => (window as any).__taktikBoard && (window as any).__taktik);
}

export function getState(page: Page) {
  return page.evaluate(() => (window as any).__taktik.editor.getState().state);
}

export async function tokenId(page: Page, team: string, number?: string): Promise<string> {
  return page.evaluate(
    ([team, number]) => {
      const tokens = Object.values((window as any).__taktik.editor.getState().state.tokens) as any[];
      return tokens.find((t) => t.team === team && (number === undefined || t.number === number)).id;
    },
    [team, number] as const,
  );
}

export function tokenClient(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const b = (window as any).__taktikBoard;
    const p = b.positions()[id];
    return b.toClient(p.x, p.y);
  }, id);
}

/** Drag a token across the canvas in small timed steps, so a running recording samples the motion. */
export async function dragToken(page: Page, id: string, dx: number, dy: number, steps = 20, stepMs = 40) {
  const start = await tokenClient(page, id);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + (dx * i) / steps, start.y + (dy * i) / steps);
    await page.waitForTimeout(stepMs);
  }
  await page.mouse.up();
}

export async function expectEventually<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeout = 8000,
) {
  await expect.poll(async () => predicate(await fn()), { timeout }).toBe(true);
}
