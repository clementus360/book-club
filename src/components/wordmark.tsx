import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "./logo";

/**
 * The name in the header: the CommonPlace logo, or the classic look's serif
 * wordmark. Sized by the font size it is given; with `fill`, the logo instead
 * spans the full width of the space it is in.
 */
export function Wordmark({ href = "/", className = "text-xl", fill = false }: { href?: string; className?: string; fill?: boolean }) {
  return (
    <Link href={href} className={`${fill ? "flex" : "inline-flex"} items-center text-ink ${className}`}>
      <Logo className={`brand-only ${fill ? "h-auto w-full" : "h-[1.75em] w-auto"}`} title={BRAND.name} />
      <span className="classic-only font-serif tracking-[-0.02em]">{BRAND.wordmark}</span>
    </Link>
  );
}
