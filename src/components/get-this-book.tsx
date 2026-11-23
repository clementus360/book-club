import { BookOpen, ExternalLink, Library, ShoppingBag, Sparkles, type LucideIcon } from "lucide-react";
import { headers } from "next/headers";
import { waysToGet, type Way } from "@/lib/books/where";
import { Icon } from "./icon";

const ICONS: Record<Way["kind"], LucideIcon> = { free: Sparkles, borrow: BookOpen, library: Library, buy: ShoppingBag };

/** Where to read, borrow or buy a book. Looks are live, so this streams in after the page. */
export async function GetThisBook({ book }: { book: Parameters<typeof waysToGet>[0] }) {
  // Vercel says which country the reader is in, so prices and stores are theirs.
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const ways = await waysToGet(book, country && /^[A-Z]{2}$/.test(country) ? country : null);
  return <WaysList ways={ways} />;
}

export function WaysList({ ways }: { ways: Way[] }) {
  return (
    <ul className="space-y-3">
      {ways.map((w) => (
        <li key={w.href + w.label}>
          <a className="link inline-flex items-start gap-1.5" href={w.href} target="_blank" rel="noopener noreferrer">
            <Icon of={ICONS[w.kind]} className="mt-[0.2em] shrink-0" /><span>{w.label}<Icon of={ExternalLink} className="ml-1 -mt-0.5 text-soft" /><span className="sr-only"> (opens in a new tab)</span></span>
          </a>
          <span className="meta block pl-[1.4em]">{w.note}</span>
        </li>
      ))}
    </ul>
  );
}

export function WaysLoading() {
  return <p className="meta" role="status">Looking for copies…</p>;
}
