import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-bold tracking-tight text-white">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="7" fill="#10b981" />
        <line x1="16" y1="4" x2="16" y2="28" stroke="#0b1020" strokeWidth="1.6" opacity="0.5" />
        <circle cx="16" cy="16" r="5" fill="none" stroke="#0b1020" strokeWidth="1.6" opacity="0.5" />
        <circle cx="9" cy="11" r="3" fill="#2563eb" stroke="#0b1020" strokeWidth="1" />
        <circle cx="23" cy="21" r="3" fill="#dc2626" stroke="#0b1020" strokeWidth="1" />
        <path
          d="M10.5 13.5 Q 15 22 20.5 20"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
          strokeDasharray="2 1.5"
        />
      </svg>
      <span>Taktik</span>
    </Link>
  );
}
