import type { Metadata } from "next";
import { LegalPage } from "@/components/app/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };

// Template policy: review and adapt (GDPR/COPPA etc.) before the public launch.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="October 11, 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your email address, display name and avatar color.</li>
        <li>Content: teams, tactics, versions, comments and reactions you create.</li>
        <li>
          Technical data: error reports (Sentry) and anonymous usage analytics (PostHog, Vercel Analytics),
          when enabled.
        </li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To run the Service: sign you in, sync tactics between teammates, send notifications you asked for, and
        fix bugs.
      </p>
      <h2>Who can see it</h2>
      <p>
        Your display name and email are visible to members of teams you belong to. Tactics are visible to
        their team, and to anyone with the link if a public link is turned on.
      </p>
      <h2>Processors</h2>
      <p>
        Data is hosted with Supabase (database, authentication, storage) and Vercel (application hosting).
        Email is sent through Resend.
      </p>
      <h2>Your choices</h2>
      <p>
        You can change your profile, turn email digests on or off, export tactics, and delete teams you own.
        Ask the operator of this deployment to delete your account.
      </p>
    </LegalPage>
  );
}
