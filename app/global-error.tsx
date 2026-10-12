"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0b1020", color: "#e2e8f0", fontFamily: "system-ui", padding: 40 }}>
        <h1>Something went wrong</h1>
        <p>The error has been reported. You can try again.</p>
        <button onClick={reset} style={{ padding: "8px 16px", marginTop: 12 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
