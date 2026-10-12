import Link from "next/link";
import { Logo } from "./Logo";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {updated}</p>
      <div className="mt-8 space-y-5 text-sm leading-relaxed text-slate-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
      <p className="mt-12 text-sm">
        <Link href="/" className="text-brand-400 hover:underline">
          Back to Taktik
        </Link>
      </p>
    </div>
  );
}
