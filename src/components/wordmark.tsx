import Link from "next/link";

export function Wordmark({ href = "/", className = "text-xl" }: { href?: string; className?: string }) {
  return <Link href={href} className={`font-serif tracking-[-0.02em] text-ink ${className}`}>CommonPlace</Link>;
}
