"use client";

import { ThumbsUp, BookMarked, BookOpen, CalendarDays, House, Library, Menu, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./icon";
import { useUnread } from "./unread";

const GLYPHS: Record<string, LucideIcon> = {
  "/app": House, "/app/current-book": BookOpen, "/app/meetings": CalendarDays, "/app/library": Library, "/app/members": Users,
  "/app/my-library": BookMarked, "/app/recommendations": ThumbsUp,
};

export const CLUB_LINKS = [
  ["/app", "Home"], ["/app/current-book", "Our book"], ["/app/meetings", "Meetings"], ["/app/library", "Club shelf"], ["/app/members", "Members"],
] as const;
export const OWN_LINKS = [["/app/my-library", "My books"], ["/app/recommendations", "Recommendations"]] as const;

function useActive() {
  const path = usePathname();
  // One menu item covers the two pages about the club's book, and the two about its shelf.
  const groups: Record<string, string[]> = { "/app/current-book": ["/app/selection"], "/app/library": ["/app/archive"] };
  return (href: string) => (href === "/app" ? path === "/app" : [href, ...(groups[href] ?? [])].some((h) => path === h || path.startsWith(`${h}/`)));
}

export function SideLinks({ links, label }: { links: readonly (readonly [string, string])[]; label: string }) {
  const active = useActive();
  return (
    <nav aria-label={label}>
      <ul>
        {links.map(([href, text]) => (
          <li key={href}>
            <Link href={href} aria-current={active(href) ? "page" : undefined}
              className="-ml-3.5 flex items-center gap-2.5 border-l-2 border-transparent py-2.5 pl-3 text-[0.9688rem] text-soft transition-colors hover:text-ink aria-[current=page]:border-rubric aria-[current=page]:text-ink aria-[current=page]:font-medium lg:py-1.5">
              <Icon of={GLYPHS[href]!} />{text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phones: the four places people go between meetings, and a sheet for the rest. */
export function BottomBar({ hasClub, children }: { hasClub: boolean; children: React.ReactNode }) {
  const active = useActive();
  const path = usePathname();
  const { unread } = useUnread();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [path]);
  const links = hasClub
    ? ([["/app", "Home"], ["/app/current-book", "Our book"], ["/app/meetings", "Meetings"], ["/app/my-library", "My books"]] as const)
    : ([["/app/my-library", "My books"], ["/app/recommendations", "Recommendations"]] as const);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex max-w-xl items-stretch">
        {links.map(([href, text]) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className="flex min-h-15 flex-1 flex-col items-center justify-center gap-1 border-t-2 border-transparent px-0.5 text-center text-xs leading-tight text-soft aria-[current=page]:border-rubric aria-[current=page]:font-medium aria-[current=page]:text-ink">
            <Icon of={GLYPHS[href]!} size="1.25rem" />{text}
          </Link>
        ))}
        <details ref={menu} className="flex-1" onKeyDown={(e) => { if (e.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
          <summary className="flex min-h-15 list-none flex-col items-center justify-center gap-1 border-t-2 border-transparent px-0.5 text-xs leading-tight text-soft [&::-webkit-details-marker]:hidden">
            <span className="relative"><Icon of={Menu} size="1.25rem" className="block" />{unread > 0 && <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-rubric" />}</span>
            <span>More{unread > 0 && <span className="sr-only">, unread notifications</span>}</span>
          </summary>
          <div className="absolute inset-x-0 bottom-full max-h-[75dvh] overflow-y-auto border-t border-rule bg-sheet px-6 py-6 shadow-[0_-12px_32px_rgb(33_31_27/0.12)]">{children}</div>
        </details>
      </div>
    </div>
  );
}
