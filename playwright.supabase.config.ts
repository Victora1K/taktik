import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * Integration tests against a local Supabase stack (`pnpm db:start`). The app must be built with the same
 * Supabase env (see the `test:e2e:supabase` script), because NEXT_PUBLIC_* values are inlined at build time.
 */
function localSupabase() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  return {
    url: status.API_URL as string,
    anon: status.ANON_KEY as string,
    service: status.SERVICE_ROLE_KEY as string,
  };
}

const sb = localSupabase();
process.env.NEXT_PUBLIC_SUPABASE_URL = sb.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = sb.anon;
process.env.SUPABASE_SERVICE_ROLE_KEY = sb.service;

const port = 3200;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e-supabase",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: sb.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anon,
      SUPABASE_SERVICE_ROLE_KEY: sb.service,
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
