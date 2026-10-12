import type { Metadata } from "next";
import { LegalPage } from "@/components/app/LegalPage";

export const metadata: Metadata = { title: "Terms of service" };

// Template terms: have them reviewed by a lawyer for your jurisdiction before the public launch.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 11, 2026">
      <p>
        These terms govern your use of Taktik (the &quot;Service&quot;). By creating an account or using the
        Service you agree to them.
      </p>
      <h2>Your account</h2>
      <p>
        You are responsible for activity on your account and for keeping access to your email address secure.
        You must be at least 13 years old, or have permission from a parent, guardian or your club.
      </p>
      <h2>Your content</h2>
      <p>
        You own the tactics, comments and other content you create. You grant us a limited licence to store,
        process and display that content solely to operate the Service for you and the teams you share it
        with. Content you publish with a public link can be viewed by anyone who has the link.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload unlawful, harassing or infringing content.</li>
        <li>Do not attempt to access teams or data you have not been invited to.</li>
        <li>Do not overload, scrape or disrupt the Service.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        The Service is provided &quot;as is&quot;. During testing it may change, have downtime, or lose data;
        export anything important.
      </p>
      <h2>Termination</h2>
      <p>You can delete your teams at any time. We may suspend accounts that break these terms.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: contact the team operating this deployment.</p>
    </LegalPage>
  );
}
