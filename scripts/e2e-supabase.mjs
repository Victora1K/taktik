// Builds the app against the local Supabase stack and runs the Supabase-mode Playwright suite.
// Requires `pnpm db:start`. Leaves a Supabase-mode build in .next; run `pnpm build` afterwards for local mode.
import { execSync } from "node:child_process";

const status = JSON.parse(
  execSync("pnpm exec supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3200",
};

if (!process.argv.includes("--no-build")) execSync("pnpm build", { stdio: "inherit", env });
execSync(
  `pnpm exec playwright test -c playwright.supabase.config.ts ${process.argv
    .slice(2)
    .filter((a) => a !== "--no-build")
    .join(" ")}`,
  {
    stdio: "inherit",
    env,
  },
);
