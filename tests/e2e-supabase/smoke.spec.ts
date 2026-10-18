import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectEventually, getState, waitForBoard } from "../e2e/helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createUser(name: string) {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@e2e.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

/** Signs in through the real callback route using a token-hash magic link, in a fresh browser context. */
async function signIn(browser: Browser, email: string, next: string): Promise<Page> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(
    `/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
  await page.waitForURL((u) => u.pathname === next);
  return page;
}

test("two signed-in teammates collaborate through Supabase", async ({ browser }) => {
  const owner = await createUser("Owner");
  const member = await createUser("Member");
  const outsider = await createUser("Outsider");
  const { data: team, error } = await admin
    .from("teams")
    .insert({ name: "E2E FC", created_by: owner.id })
    .select()
    .single();
  if (error) throw error;
  await admin.from("team_members").insert([
    { team_id: team.id, user_id: owner.id, role: "owner" },
    { team_id: team.id, user_id: member.id, role: "member" },
  ]);

  // Owner creates a tactic from the library.
  const a = await signIn(browser, owner.email, `/teams/${team.id}`);
  await a.getByTestId("new-tactic").click();
  await a.getByTestId("sport-soccer").click();
  await a.getByTestId("create-tactic").click();
  await a.waitForURL(/\/tactics\//);
  await waitForBoard(a);
  const tacticPath = new URL(a.url()).pathname;
  const tacticId = tacticPath.split("/").pop()!;

  // Member opens it in a separate browser context, so sync must go through Realtime.
  const b = await signIn(browser, member.email, `/teams/${team.id}`);
  await b.goto(tacticPath);
  await waitForBoard(b);
  const count = async (p: Page) => Object.keys((await getState(p)).tokens).length;
  await expectEventually(
    () => count(b),
    (n) => n > 0,
    15_000,
  );
  const initial = await count(b);

  await a.getByRole("button", { name: "Add player" }).click();
  await expectEventually(
    () => count(b),
    (n) => n === initial + 1,
    15_000,
  );
  await b.getByRole("button", { name: "Add ball" }).click();
  await expectEventually(
    () => count(a),
    (n) => n === initial + 2,
    15_000,
  );

  // Presence: each sees the other.
  await expectEventually(
    () => a.evaluate(() => (window as any).__taktik.editor.getState().peers.length),
    (n) => n >= 1,
    15_000,
  );

  // Comments arrive through the Postgres change feed, with a mention notification.
  await a.getByRole("tab", { name: "Comments" }).click();
  await b.getByRole("tab", { name: "Comments" }).click();
  await b.getByPlaceholder(/Discuss this tactic/).fill("Can we push the full-backs higher?");
  await b.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(a.getByText("Can we push the full-backs higher?")).toBeVisible({ timeout: 15_000 });

  // The snapshot is persisted to Postgres.
  await expect(a.getByTestId("save-status")).toContainText("Saved", { timeout: 20_000 });
  await expectEventually(
    async () => (await admin.from("tactics").select("doc_state").eq("id", tacticId).single()).data?.doc_state,
    (v) => typeof v === "string" && v.length > 10,
    20_000,
  );
  await b.reload();
  await waitForBoard(b);
  await expectEventually(
    () => count(b),
    (n) => n === initial + 2,
    15_000,
  );

  // An outsider is denied.
  const c = await signIn(browser, outsider.email, "/teams");
  await c.goto(tacticPath);
  await expect(c.getByTestId("board")).toHaveCount(0, { timeout: 10_000 });
});

test("a signed-in invitee can accept a team invitation from the notification bell", async ({ browser }) => {
  const owner = await createUser("Coach");
  const guest = await createUser("Guest");
  const { data: team, error } = await admin
    .from("teams")
    .insert({ name: "Invite FC", created_by: owner.id })
    .select()
    .single();
  if (error) throw error;
  await admin.from("team_members").insert({ team_id: team.id, user_id: owner.id, role: "owner" });
  const { error: inviteError } = await admin.from("team_invites").insert({
    team_id: team.id,
    email: guest.email,
    role: "member",
    created_by: owner.id,
  });
  if (inviteError) throw inviteError;

  const page = await signIn(browser, guest.email, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Draw the play");
  await expect(page.getByLabel(/Notifications/)).toBeVisible();
  await page.getByLabel(/Notifications/).click();
  await expect(page.getByText("Invite FC")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.waitForURL(new RegExp(`/teams/${team.id}$`));
  await expect(page.getByRole("heading", { name: "Invite FC" })).toBeVisible();
});
