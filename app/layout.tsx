import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "taktiks - collaborative tactics board", template: "%s | taktiks" },
  description:
    "Draw up plays for soccer, basketball, volleyball, football, baseball and tennis, animate player movement, and plan tactics together with your team in real time.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Toaster />
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
