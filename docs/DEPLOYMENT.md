# Deploying Taktik

There are three environments:

| Environment | Web                        | Database                      | Deploys                                  |
| ----------- | -------------------------- | ----------------------------- | ---------------------------------------- |
| Local       | `pnpm dev`                 | Supabase CLI (Docker)         | -                                        |
| Staging     | Vercel preview (every PR)  | Supabase project `staging`    | Migrations on every merge to `main`      |
| Production  | Vercel production (`main`) | Supabase project `prod` (Pro) | Migrations on a published GitHub release |

Everything below is a one-time setup unless noted. Budget about an hour.

## 1. Supabase projects

Create two projects at [supabase.com](https://supabase.com/dashboard): `taktik-staging` (Free is fine) and
`taktik-prod` (**Pro**, see [Backups](#6-backups-and-point-in-time-recovery)). Use the same region as your
Vercel functions (for example `us-east-1` with Vercel's `iad1`).

For **each** project:

1. **Apply the schema.** From your machine:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   ```

   After that, GitHub Actions takes over (see [CI/CD](#4-github-actions)).

2. **Auth -> URL Configuration.**
   - Site URL: `https://taktiks.co` (prod) or your staging alias (for example `https://staging.taktiks.co`).
   - Redirect URLs: `https://taktiks.co/auth/callback`, plus for staging
     `https://*-<your-vercel-team>.vercel.app/auth/callback` so preview deploys can sign in.

3. **Auth -> Email Templates -> Magic Link.** Paste `supabase/templates/magic_link.html` and set the subject to
   "Your taktiks sign-in code". Set the email OTP length to 6. The message includes that code, which the login
   page accepts with `verifyOtp`, and a link that signs in through `/auth/callback?token_hash=...` on any device.

4. **Auth -> SMTP.** Use Resend's SMTP (`smtp.resend.com`, port 465, user `resend`, password = your Resend API
   key) and a sender on your verified domain. Supabase's built-in mailer is limited to a few emails per hour and
   is not meant for production.

5. **Auth -> Providers -> Google** (optional). Create an OAuth client in Google Cloud Console (type: Web).
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and
   secret into Supabase.

6. **Realtime -> Settings.** Turn off **"Allow public access"**, so that only private channels are allowed.
   Taktik only uses private channels, and its access rules live in the `realtime.messages` policies.

7. **API keys.** Note the project URL, the `anon` key and the `service_role` key for the next step. Never
   expose the service role key to the browser.

## 2. Vercel

1. Import the GitHub repo in Vercel. The framework preset is Next.js, the install command is
   `pnpm install --frozen-lockfile`, and the Node version is **22.x**.
2. **Environment variables.** Set these for **Production** with the prod project, and for **Preview** with the
   staging project:

   | Variable                        | Notes                                                                                               |
   | ------------------------------- | --------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | `https://<ref>.supabase.co`                                                                         |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                                                                                            |
   | `SUPABASE_SERVICE_ROLE_KEY`     | service role key (server only; used for email, cron and rate limits)                                |
   | `NEXT_PUBLIC_SITE_URL`          | `https://taktiks.co` for Production; leave it unset for Preview, which then uses the deployment URL |
   | `RESEND_API_KEY`                | from resend.com                                                                                     |
   | `EMAIL_FROM`                    | `Taktik <notifications@taktiks.co>` (verified domain)                                               |
   | `CRON_SECRET`                   | a random 32+ character string; Vercel Cron sends it automatically                                   |
   | `NEXT_PUBLIC_SENTRY_DSN`        | Sentry project DSN                                                                                  |
   | `NEXT_PUBLIC_POSTHOG_KEY`       | PostHog project key (optional)                                                                      |
   | `NEXT_PUBLIC_POSTHOG_HOST`      | `https://us.i.posthog.com` or `https://eu.i.posthog.com`                                            |

3. **Analytics.** Enable Vercel Web Analytics on the project. The script is only loaded on Vercel.
4. **Cron.** `vercel.json` schedules `/api/cron/digest` daily at 07:00 UTC. It runs on Production only.

Every PR now gets a preview URL backed by the staging database.

## 3. Custom domain

1. In Vercel, open Settings -> Domains and add `taktiks.co` and `www.taktiks.co` (redirect `www` to the apex).
2. At your DNS provider, add an `A` record from `@` to `76.76.21.21` and a `CNAME` from `www` to
   `cname.vercel-dns.com`. Vercel provisions TLS automatically.
3. In Resend, verify the domain (SPF, DKIM, and optionally DMARC records) so emails don't land in spam.
4. Update the Supabase Site URL and redirect URLs (step 1.2) and `NEXT_PUBLIC_SITE_URL`.

## 4. GitHub Actions

- `ci.yml` runs on every PR. One job runs lint, typecheck, Prettier, unit tests, the build and the local-mode
  Playwright suite. A second job starts a local Supabase stack and runs the pgTAP RLS tests, SQL lint and the
  signed-in multi-browser Playwright suite.
- `migrations.yml` pushes migrations to **staging** on every merge to `main` that touches
  `supabase/migrations`. It pushes to **production** when you publish a GitHub release, or on a manual run that
  selects `production`.

Create two GitHub **Environments**, `staging` and `production`, each with these secrets:

- `SUPABASE_ACCESS_TOKEN`: create one at supabase.com under Account -> Access Tokens.
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Add required reviewers to `production` so a person approves every production migration.

Also enable branch protection on `main` that requires the `checks` and `database` jobs.

## 5. Monitoring

- **Errors:** Sentry captures client and server errors (`instrumentation*.ts`). Set an alert for new issues
  and for error-rate spikes.
- **Uptime:** point an uptime monitor (Better Stack, UptimeRobot, or Checkly) at `https://taktiks.co/api/health`
  every minute. It returns 503 when the database API is unreachable.
- **Database and Realtime:** use Supabase's Reports pages and the Realtime inspector, and set usage alerts in
  the organization's billing settings.
- **Product analytics:** PostHog events: `team_created`, `tactic_created`, `comment_created`,
  `share_link_toggled`, `export_png`, `export_video` and `export_json`.

## 6. Backups and point-in-time recovery

- The **Pro** plan includes daily backups with 7-day retention. For launch, enable the **Point-in-Time
  Recovery** add-on (Settings -> Add-ons), which allows restoring to any second in the retention window.
- Do a **restore drill** before launch: restore the latest prod backup into a new project, run
  `pnpm exec supabase db lint` against it, and open a few tactics through a preview deploy pointed at it.
- Tactic content also lives in every collaborator's browser while open, and the JSON export is a user-level
  backup.

## 7. Rate limits and quotas

- API routes are rate-limited per user through Postgres (`check_rate_limit`, migration
  `20261012000000_rate_limits.sql`). Snapshot saves allow 60 per minute per tactic per user, comment emails
  30 per minute, and invite emails 20 per hour. Without the service role key the limiter falls back to
  per-instance memory.
- **Realtime messages** are the main quota. Presence adapts its send rate to the room size, keeping a room
  around 150 deliveries per second. Document edits are batched every 50 ms. Pro includes 500 messages per
  second and 500 concurrent connections. Raise these in the Supabase dashboard (Settings -> Realtime) before a
  big launch.

## Realtime load test

Run this against **staging** (never production). It creates throwaway users and deletes them afterwards.

```bash
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
pnpm loadtest --clients 12 --seconds 60
```

It passes when at least 98% of messages are delivered and p95 latency is at most 400 ms (both are adjustable
with `--min-delivery` and `--max-p95`). Results on the local stack:

| Room size | Presence rate | Deliveries/s | Delivered | p50 / p95 / p99  |
| --------- | ------------- | ------------ | --------- | ---------------- |
| 8         | 2.7 Hz        | 148          | 100%      | 8 / 20 / 42 ms   |
| 20        | 2 Hz          | 462          | 98.8%     | 14 / 52 / 104 ms |

Rooms above about 12 active editors exceed the presence budget, because the rate is floored at 2 Hz. That is
fine for coaching sessions, but run the test at your expected peak before launch.

## 8. Closed beta checklist (staging)

- [ ] Staging project configured (steps 1 to 4); preview deploys sign in with magic link and Google.
- [ ] Create a "Taktik beta" team and invite 3 to 5 real teams (coaches as `coach`, players as `member`).
- [ ] Ask each team to: build a set piece with at least 3 layered runs, discuss it in comments with a mention,
      present it with follow-presenter on a call, and share a public link with someone outside the team.
- [ ] Watch Sentry and PostHog during sessions; collect feedback in a shared form.
- [ ] Test on at least one iPhone (Safari), one Android phone (Chrome) and one iPad. Recording on phones uses
      the enlarged touch hit area.
- [ ] Run `pnpm loadtest` against staging at the largest expected room size.
- [ ] Fix the issues the beta finds, then cut a release.

## 9. Launch checklist (production)

- [ ] Prod project on Pro, with PITR enabled and a restore drill done (section 6).
- [ ] Custom domain, TLS, and Resend domain verified (section 3).
- [ ] Production environment variables set (section 2); `NEXT_PUBLIC_SITE_URL` is the real domain.
- [ ] Auth Site URL and redirect URLs updated; magic link template and SMTP configured.
- [ ] Realtime public access disabled and quotas raised as needed (section 7).
- [ ] `production` GitHub environment has secrets and required reviewers; a release has applied migrations.
- [ ] Sentry alerts, the uptime monitor and Supabase usage alerts are active.
- [ ] `/terms` and `/privacy` reviewed by whoever is accountable for the service, with the contact address
      updated.
- [ ] Smoke test on production: sign up, create a team, invite a second account, co-edit, comment, share
      publicly, and export a video.
- [ ] Announce.

## Troubleshooting

- **The magic link opens the login page with `?error=auth`:** the link expired or was already used, or the
  redirect URL is not in Supabase's allow list.
- **Edits don't sync between people:** check Realtime "Allow public access" and the RLS policies on
  `realtime.messages` (`pnpm db:test` covers them). Also check the browser console for `CHANNEL_ERROR`.
- **The save status says "Save failed, retrying":** the snapshot route returned an error. Check the Vercel function logs.
  A 403 means the user is a viewer; a 429 means they are rate-limited.
