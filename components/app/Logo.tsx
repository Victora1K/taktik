import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-white">
      <Image src="/brand/mark.png" alt="" width={243} height={264} className="h-7 w-auto" priority />
      <span className="text-lg font-extrabold tracking-tight">taktiks</span>
    </Link>
  );
}
