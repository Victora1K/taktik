// Realtime load test: N signed-in teammates on one private tactic channel, sending presence at the app's
// adaptive rate plus periodic document updates. Reports join time, delivery ratio and end-to-end latency.
//
//   pnpm loadtest                         # against the local stack from `pnpm db:start`
//   pnpm loadtest --clients 12 --seconds 60
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... pnpm loadtest   # staging
//
// Creates throwaway users, a team and a tactic, and deletes them afterwards. Never point this at production.
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: {
    clients: { type: "string", default: "8" },
    seconds: { type: "string", default: "20" },
    "update-every": { type: "string", default: "2" },
    "max-p95": { type: "string", default: "400" },
    "min-delivery": { type: "string", default: "0.98" },
  },
});
const CLIENTS = Number(args.clients);
const SECONDS = Number(args.seconds);
const UPDATE_EVERY_S = Number(args["update-every"]);

// Mirrors lib/collab/provider.ts.
const AWARENESS_BUDGET_PER_S = 150;
const awarenessHz = Math.min(12, Math.max(2, AWARENESS_BUDGET_PER_S / (CLIENTS * (CLIENTS - 1))));

function config() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const s = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  return { url: s.API_URL, anon: s.ANON_KEY, service: s.SERVICE_ROLE_KEY };
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN;
const fmt = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : "n/a");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (typeof WebSocket === "undefined") throw new Error("Node 22+ is required (native WebSocket)");
  if (CLIENTS < 2) throw new Error("--clients must be at least 2");
  const { url, anon, service } = config();
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const password = `Lt-${runId}-${Math.random().toString(36).slice(2)}`;

  console.log(
    `Taktik realtime load test: ${CLIENTS} clients, ${SECONDS}s, presence ${awarenessHz.toFixed(1)} Hz/client, doc update every ${UPDATE_EVERY_S}s`,
  );
  console.log(`Target: ${url}`);

  const userIds = [];
  let teamId = null;
  const clients = [];
  try {
    for (let i = 0; i < CLIENTS; i++) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `loadtest-${runId}-${i}@loadtest.invalid`,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Load ${i}` },
      });
      if (error) throw error;
      userIds.push(data.user.id);
    }
    const team = await admin
      .from("teams")
      .insert({ name: `Load test ${runId}`, created_by: userIds[0] })
      .select()
      .single();
    if (team.error) throw team.error;
    teamId = team.data.id;
    const members = await admin
      .from("team_members")
      .insert(userIds.map((id, i) => ({ team_id: teamId, user_id: id, role: i === 0 ? "owner" : "member" })));
    if (members.error) throw members.error;
    const tactic = await admin
      .from("tactics")
      .insert({ team_id: teamId, sport: "soccer", title: "Load test" })
      .select()
      .single();
    if (tactic.error) throw tactic.error;
    const topic = `tactic:${tactic.data.id}`;

    const latencies = [];
    let expected = 0;
    let received = 0;
    let sendErrors = 0;
    const joinTimes = [];

    await Promise.all(
      userIds.map(async (_, i) => {
        const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await sb.auth.signInWithPassword({
          email: `loadtest-${runId}-${i}@loadtest.invalid`,
          password,
        });
        if (error) throw error;
        await sb.realtime.setAuth();
        const t0 = performance.now();
        const channel = sb.channel(topic, {
          config: { private: true, broadcast: { self: false, ack: false } },
        });
        channel.on("broadcast", { event: "*" }, ({ payload }) => {
          if (payload?.run !== runId) return;
          received++;
          latencies.push(Date.now() - payload.t);
        });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`client ${i} timed out joining`)), 15_000);
          channel.subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timer);
              joinTimes.push(performance.now() - t0);
              resolve();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timer);
              reject(new Error(`client ${i} could not join: ${status} ${err?.message ?? ""}`));
            }
          });
        });
        clients.push({ sb, channel, i });
      }),
    );
    console.log(
      `All ${CLIENTS} clients joined (join p50 ${fmt(
        pct(
          joinTimes.sort((a, b) => a - b),
          50,
        ),
      )}, max ${fmt(Math.max(...joinTimes))})`,
    );
    await sleep(500);

    const cursorPayload = "x".repeat(160); // about the size of an encoded awareness update
    const docPayload = "u".repeat(600); // a typical batched edit
    const stopAt = Date.now() + SECONDS * 1000;
    await Promise.all(
      clients.map(async ({ channel, i }) => {
        let nextUpdate = Date.now() + Math.random() * UPDATE_EVERY_S * 1000;
        while (Date.now() < stopAt) {
          const isDoc = Date.now() >= nextUpdate;
          if (isDoc) nextUpdate += UPDATE_EVERY_S * 1000;
          const res = await channel.send({
            type: "broadcast",
            event: isDoc ? "update" : "awareness",
            payload: { run: runId, from: i, t: Date.now(), u: isDoc ? docPayload : cursorPayload },
          });
          if (res === "ok") expected += CLIENTS - 1;
          else sendErrors++;
          await sleep(1000 / awarenessHz);
        }
      }),
    );
    await sleep(2000);

    latencies.sort((a, b) => a - b);
    const delivery = expected ? received / expected : 0;
    const p95 = pct(latencies, 95);
    console.log("");
    console.log(
      `Messages delivered: ${received}/${expected} (${(delivery * 100).toFixed(2)}%), send errors: ${sendErrors}`,
    );
    console.log(`Deliveries/s: ${(received / SECONDS).toFixed(0)}`);
    console.log(
      `Latency p50 ${fmt(pct(latencies, 50))}  p95 ${fmt(p95)}  p99 ${fmt(pct(latencies, 99))}  max ${fmt(latencies.at(-1))}`,
    );

    const ok = delivery >= Number(args["min-delivery"]) && p95 <= Number(args["max-p95"]);
    console.log(
      ok ? "\nPASS" : `\nFAIL (need delivery >= ${args["min-delivery"]} and p95 <= ${args["max-p95"]}ms)`,
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    await Promise.all(clients.map(({ sb, channel }) => sb.removeChannel(channel).catch(() => undefined)));
    if (teamId) await admin.from("teams").delete().eq("id", teamId);
    for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
