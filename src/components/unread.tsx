"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const Unread = createContext<{ unread: number; setUnread: (n: number) => void }>({ unread: 0, setUnread: () => {} });
export const useUnread = () => useContext(Unread);

const EVERY = 20_000;

/**
 * The unread count. Moving between pages does not render the menu again on the
 * server, so it is asked for on the way, and when someone comes back to the tab.
 * `server` is a new object on every server render, which is how one is noticed.
 */
export function UnreadProvider({ server, children }: { server: { count: number }; children: ReactNode }) {
  const [unread, set] = useState(server.count);
  const [from, setFrom] = useState(server);
  if (from !== server) { setFrom(server); set(server.count); }
  const path = usePathname();
  const asked = useRef(0);
  const changed = useRef(0); // so a slow answer cannot undo something done since

  useEffect(() => { changed.current++; }, [server]);
  useEffect(() => {
    const ask = async (force: boolean) => {
      if (document.visibilityState !== "visible" || (!force && Date.now() - asked.current < EVERY)) return;
      asked.current = Date.now();
      const version = changed.current;
      try {
        const response = await fetch("/app/unread", { cache: "no-store" });
        const { unread: n } = (await response.json()) as { unread?: number };
        if (typeof n === "number" && version === changed.current) set(n);
      } catch { /* offline, or signed out: keep what is shown */ }
    };
    if (asked.current === 0) asked.current = Date.now(); // the first page came with its count
    else void ask(false);
    const back = () => void ask(true);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("pageshow", back); };
  }, [path]);

  const [setUnread] = useState(() => (n: number) => { changed.current++; set(n); });
  return <Unread value={{ unread, setUnread }}>{children}</Unread>;
}

export function UnreadCount() {
  const { unread } = useUnread();
  if (unread <= 0) return null;
  return <span className="rounded-full bg-rubric px-2 py-0.5 text-xs font-medium text-sheet">{unread > 99 ? "99+" : unread}<span className="sr-only"> unread</span></span>;
}
