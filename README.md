# Taktik

A collaborative tactics board for soccer, basketball, volleyball, football, baseball and tennis. Pick a sport, place your players and
opponents on a to-scale field, record their movement by dragging them, and layer more runs on top while the
clip replays. Teammates edit the same tactic live, with cursors and presence, and discuss it in comments pinned
to a moment in the clip or a spot on the field.

## Features

- **Board:** to-scale fields, default formations, numbered and named player tokens, custom colors, shapes,
  sizes and labels, group selection and drag, zoom and pan, and touch support.
- **Animation:** real-time motion recording, smooth or linear paths, overdub that replaces or layers, layers
  with mute and solo, editable keyframes, timed annotations (arrows, lines, zones, text, freehand), and
  undo/redo.
- **Collaboration:** live co-editing with a Yjs CRDT over Supabase Realtime, cursors, selections and soft locks
  while recording, and a follow-the-presenter mode.
- **Discussion:** threaded comments anchored to a time and a field position, @mentions, reactions, resolve,
  in-app notifications, and email notifications plus a daily digest.
- **Teams:** owner, coach, member and viewer roles, link and email invites, a library with folders, tags and
  search, named versions, and thumbnails.
- **Sharing:** read-only public links (embeddable), and export to PNG, video (MP4 or WebM) or a JSON file you
  can re-import.

## Quick start (no accounts needed)

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Without Supabase environment variables the app runs in **local mode**: data is
kept in the browser and real-time collaboration works between tabs of the same browser. This is the fastest
way to try every feature.

## Running against Supabase locally

Requires Docker.

```bash
pnpm db:start                         # local Supabase (Postgres, Auth, Realtime, Storage)
cp .env.example .env.local            # then paste the API URL, anon key and service role key it printed
pnpm dev
```

Sign-in emails are captured by the local mail catcher (the "Mailpit" URL printed by `pnpm db:start`).

## Scripts

| Command                  | What it does                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`               | Development server                                                                   |
| `pnpm build`             | Production build                                                                     |
| `pnpm lint`              | ESLint                                                                               |
| `pnpm typecheck`         | TypeScript                                                                           |
| `pnpm format`            | Prettier (CI runs `format:check`)                                                    |
| `pnpm test`              | Unit tests (engine math, sync protocol, actions, sports, colors)                     |
| `pnpm test:e2e`          | Playwright against a local-mode build (`pnpm build` first)                           |
| `pnpm test:e2e:supabase` | Builds against the local Supabase stack and runs the signed-in multi-browser suite   |
| `pnpm db:test`           | pgTAP tests for row-level security, RPCs and the rate limiter                        |
| `pnpm loadtest`          | Realtime load test (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#realtime-load-test)) |

`pnpm test:e2e:supabase` leaves a Supabase-mode build in `.next`; run `pnpm build` again before `pnpm test:e2e`.

## How it fits together

- **Next.js 15** (App Router) on Vercel, **Tailwind v4**, **react-konva** for the board, **Zustand** for UI
  state.
- **Tactic documents are Yjs CRDTs.** Edits sync over a private Supabase Realtime broadcast channel per tactic
  (`lib/collab/provider.ts`). Presence, cursors and live drags travel as Yjs awareness, rate-adapted to the
  room size. Snapshots are merged and compacted server-side (`app/api/tactics/[id]/snapshot`) and stored in
  Postgres.
- **Everything else is Postgres with row-level security** (`supabase/migrations`). Viewers can join a channel
  but cannot send document updates; that rule is enforced by policies on `realtime.messages`.
- **The animation engine** (`lib/engine`) is pure TypeScript: keyframe interpolation (linear and Catmull-Rom),
  time-weighted path simplification, track merging and layer resolution.
- **`lib/data`** has one interface with two implementations: Supabase, and localStorage for local mode.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for staging and production setup, environment variables, the
closed-beta checklist and the launch checklist.
