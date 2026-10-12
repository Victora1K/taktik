import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-3xl font-bold">Offside!</h1>
        <p className="mt-2 text-slate-400">This page does not exist.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-ink-950"
        >
          Back to Taktik
        </Link>
      </div>
    </div>
  );
}
