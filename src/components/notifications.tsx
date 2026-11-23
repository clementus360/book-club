"use client";

import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import type { Notice } from "@/lib/data/notifications";
import { eventIcon } from "./event-icon";
import { Icon, Labelled } from "./icon";
import { Empty, PageHeader } from "./ui";
import { useUnread } from "./unread";
import { trouble } from "@/lib/trouble";

/** Marks appear at once, and come back with a reason if saving them fails. */
export function Notifications({ notices, unread: saved, before, older }: { notices: Notice[]; unread: number; before: string | null; older: string | null }) {
  const router = useRouter();
  const { setUnread } = useUnread();
  const list = useRef<HTMLUListElement>(null);
  const [said, say] = useState<{ ok: boolean; text: string } | null>(null);
  const [opened, setOpened] = useState<readonly string[]>([]);
  const [marked, mark] = useOptimistic<readonly string[], readonly string[]>([], (now, ids) => [...now, ...ids]);
  const isRead = (n: Notice) => n.read || opened.includes(n.id) || marked.includes(n.id);
  const here = notices.filter((n) => !isRead(n)).length;
  const elsewhere = saved - notices.filter((n) => !n.read).length; // unread ones further down than this page shows
  const [cleared, clear] = useOptimistic(false, () => true);
  const unread = cleared ? 0 : here + Math.max(0, elsewhere);

  // The menu shows what this page shows, marks still being saved included.
  useEffect(() => { setUnread(unread); }, [unread, notices, setUnread]);

  // Coming back from something opened here, by the Back button or another tab.
  useEffect(() => {
    const shown = (e: PageTransitionEvent) => { if (e.persisted) router.refresh(); };
    const seen = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("pageshow", shown);
    document.addEventListener("visibilitychange", seen);
    return () => { window.removeEventListener("pageshow", shown); document.removeEventListener("visibilitychange", seen); };
  }, [router]);

  const read = (n: Notice, button: HTMLElement) => {
    button.closest("li")?.querySelector("a")?.focus(); // the button is about to go
    startTransition(async () => {
      mark([n.id]);
      const result = await markNotificationRead(n.id).catch((error: unknown) => { trouble(error); return null; });
      startTransition(() => {
        say(result?.ok ? { ok: true, text: "Marked as read." } : { ok: false, text: result?.message ?? "That could not be saved. Please try again." });
      });
    });
  };
  const readAll = () => {
    if (!before) return;
    list.current?.focus();
    startTransition(async () => {
      mark(notices.map((n) => n.id));
      clear(undefined);
      const result = await markAllNotificationsRead(before).catch((error: unknown) => { trouble(error); return null; });
      startTransition(() => {
        say(result?.ok ? { ok: true, text: "All marked as read." } : { ok: false, text: result?.message ?? "That could not be saved. Please try again." });
      });
    });
  };
  const open = (n: Notice) => {
    if (isRead(n)) return;
    setOpened((now) => [...now, n.id]);
  };

  return (
    <>
      <PageHeader kicker="Across your clubs" title="Notifications" action={unread > 0 && <button type="button" className="btn btn-plain" onClick={readAll}><Labelled>Mark all as read</Labelled></button>}>
        What has happened in your clubs. Opening one marks it as read.
      </PageHeader>
      {said && !said.ok && <p role="alert" className="mb-5 text-rubric">{said.text}</p>}
      {notices.length === 0 ? <Empty icon={Bell} title="Nothing yet">You will hear about votes, meetings and recommendations in your clubs.</Empty> : (
        <ul ref={list} tabIndex={-1} aria-label="Notifications" className="outline-none">
          {notices.map((n) => {
            const done = isRead(n);
            return (
              <li key={n.id} className="row-sm flex items-start justify-between gap-4">
                {/* A plain link: /app/go marks it read and switches club, so it must not be prefetched. */}
                <a href={n.href} onClick={() => open(n)} onAuxClick={(e) => { if (e.button === 1) open(n); }} className="flex min-w-0 flex-1 gap-3 underline-offset-4 hover:underline">
                  <Icon of={eventIcon(n.type)} size="1.25rem" className={`mt-0.5 ${done ? "text-soft" : "text-rubric"}`} />
                  <span className="min-w-0 break-words">{!done && <span className="sr-only">Unread: </span>}<span className={done ? "text-soft" : "font-medium"}>{n.text}</span><span className="meta block">{n.meta}</span></span>
                </a>
                {!done && (
                  <button type="button" data-hint="Takes off the unread mark without opening it." aria-label={`Mark as read: ${n.text}`} className="btn-text -my-2 min-w-11 shrink-0 justify-center text-sm sm:-my-1.5" onClick={(e) => read(n, e.currentTarget)}>
                    <Icon of={Check} size="1.25rem" className="sm:hidden" /><span className="max-sm:sr-only">Mark as read</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="sr-only">{said?.ok && said.text}</p>
      {older && <p className="mt-5"><Link href={older} scroll={false} className="btn-text">Show older</Link></p>}
    </>
  );
}
