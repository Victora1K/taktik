import { Clapperboard, Layers, MessageSquare, MousePointer2, Share2, Users } from "lucide-react";
import Link from "next/link";
import { MarketingHeader } from "@/components/app/MarketingHeader";
import { SportPreview } from "@/components/app/SportPreview";
import { SPORT_LIST, SPORTS } from "@/lib/sports";

const FEATURES = [
  {
    icon: MousePointer2,
    title: "Drag, drop, done",
    body: "Numbered players and opponents on a to-scale field. Move one, or box-select a whole back line and move them together.",
  },
  {
    icon: Clapperboard,
    title: "Record the movement",
    body: "Hit record and drag. The clip plays while you move players, capturing every run, cut and rotation.",
  },
  {
    icon: Layers,
    title: "Layer multi-player plays",
    body: "Replay the clip and record another player on top. Keep alternative runs on separate layers and solo them.",
  },
  {
    icon: Users,
    title: "Edit together, live",
    body: "Teammates see each other's cursors and edits instantly. Present a play and everyone follows along.",
  },
  {
    icon: MessageSquare,
    title: "Discuss in context",
    body: "Pin comments to a moment in the clip or a spot on the field, @mention teammates and resolve threads.",
  },
  {
    icon: Share2,
    title: "Share anywhere",
    body: "Team libraries with folders and tags, public view-only links, embeds, and PNG or video exports.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <MarketingHeader />

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Draw the play. <span className="text-brand-400">Animate it.</span> Win it together.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            taktiks is a collaborative tactics board for soccer, basketball, volleyball, football, baseball
            and tennis. Pick a sport, set your players and opponents, record their movement, and work through
            the plan with your whole team in real time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/teams"
              className="rounded-lg bg-brand-500 px-5 py-3 font-semibold text-ink-950 hover:bg-brand-400"
            >
              Start a tactic - free
            </Link>
            <a
              href="#features"
              className="rounded-lg border border-ink-700 px-5 py-3 font-medium text-slate-200 hover:bg-ink-800"
            >
              See how it works
            </a>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-ink-800 shadow-2xl">
          <SportPreview sport={SPORTS.soccer} className="aspect-[16/10] w-full" />
          <svg viewBox="-4 -4 113 76" className="absolute inset-0 h-full w-full" aria-hidden>
            <path
              id="run1"
              d="M30 20 C 45 10, 60 15, 75 22"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="0.5"
              strokeDasharray="1.5 1"
              opacity="0.8"
            />
            <path
              id="run2"
              d="M32 48 C 50 55, 62 45, 80 40"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="0.5"
              strokeDasharray="1.5 1"
              opacity="0.8"
            />
            <path
              id="ballrun"
              d="M40 34 C 55 30, 65 28, 75 22"
              fill="none"
              stroke="#fff"
              strokeWidth="0.4"
              strokeDasharray="1 1"
              opacity="0.6"
            />
            {[
              { path: "#run1", n: 7, c: "#2563eb", dur: "4s" },
              { path: "#run2", n: 11, c: "#2563eb", dur: "4.5s" },
            ].map((p) => (
              <g key={p.n}>
                <circle r="2.2" fill={p.c} stroke="#0b1020" strokeWidth="0.3">
                  <animateMotion
                    dur={p.dur}
                    repeatCount="indefinite"
                    keyPoints="0;1;1"
                    keyTimes="0;0.8;1"
                    calcMode="linear"
                  >
                    <mpath href={p.path} />
                  </animateMotion>
                </circle>
              </g>
            ))}
            <circle r="0.9" fill="#fff" stroke="#111" strokeWidth="0.25">
              <animateMotion
                dur="4s"
                repeatCount="indefinite"
                keyPoints="0;0;1;1"
                keyTimes="0;0.35;0.8;1"
                calcMode="linear"
              >
                <mpath href="#ballrun" />
              </animateMotion>
            </circle>
            {[
              [40, 34, "10"],
              [62, 30, "4"],
              [66, 44, "5"],
              [88, 34, "1"],
            ].map(([x, y, n], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <circle r="2.2" fill={i === 0 ? "#2563eb" : "#dc2626"} stroke="#0b1020" strokeWidth="0.3" />
                <text fontSize="2.2" fill="#fff" textAnchor="middle" dy="0.8" fontWeight="bold">
                  {n}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {SPORT_LIST.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
              <SportPreview sport={s} className="aspect-[16/9] w-full" />
              <div className="p-3 text-sm">
                <b>{s.name}</b>{" "}
                <span className="text-slate-400">- up to {s.maxPerSide} a side, standard dimensions</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="border-t border-ink-800 bg-ink-900/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-ink-800 bg-ink-900 p-5">
              <f.icon className="text-brand-400" size={22} />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500">
        <span>taktiks - tactics, together.</span>
        <span className="flex gap-4">
          <Link href="/terms" className="hover:text-slate-300">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-slate-300">
            Privacy
          </Link>
        </span>
      </footer>
    </div>
  );
}
