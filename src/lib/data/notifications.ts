import "server-only";
import { describeEvent } from "@/lib/events";
import { fromNow } from "@/lib/dates";
import { nameOf } from "@/components/ui";
import { getViewer, must } from "@/lib/viewer";

export type Notice = { id: string; type: string; text: string; href: string; meta: string; read: boolean };

/**
 * The reader's notifications, newest first. A notification stores only what it
 * refers to, so titles are looked up here, as the reader, when it is shown.
 */
export async function getNotifications(limit: number) {
  const { supabase, userId, clubs } = await getViewer();
  // Deadlines pass in every club, not only the one being looked at.
  const synced = await Promise.all(clubs.map((c) => supabase.rpc("sync_club", { p_club_id: c.id })));
  for (const { error } of synced) if (error) console.error("[commonplace]", error.code, error.message);

  const [found, unread] = await Promise.all([
    supabase.from("notifications")
      .select("id, type, reference_id, read_at, created_at, actor:profiles!notifications_actor_id_fkey(display_name), club:clubs!notifications_club_id_fkey(id, name, kind)")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit + 1),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (unread.error) throw new Error(unread.error.message);
  const rows = must(found);
  const list = rows.slice(0, limit);

  const refs = (kind: (type: string) => boolean) => [...new Set(list.flatMap((n) => (kind(n.type) && n.reference_id ? [n.reference_id] : [])))];
  const recs = refs((t) => t === "recommendation_shared");
  const meets = refs((t) => t.startsWith("meeting_"));
  const cycles = refs((t) => /^(nominations|voting|runoff|decision|cycle)_|^book_selected$/.test(t));
  const polls = refs((t) => t.startsWith("poll_"));
  const [r, m, c, p] = await Promise.all([
    recs.length ? supabase.from("club_recommendations").select("id, book:books!club_recommendations_book_id_fkey(title)").in("id", recs) : null,
    meets.length ? supabase.from("meetings").select("id, title").in("id", meets) : null,
    cycles.length ? supabase.from("reading_cycles").select("id, status, book:books!reading_cycles_book_id_fkey(title)").in("id", cycles) : null,
    polls.length ? supabase.from("meeting_polls").select("id, title").in("id", polls) : null,
  ]);
  const books = new Map([...(r ? must(r) : []), ...(c ? must(c) : [])].map((x) => [x.id, x.book?.title]));
  const meetings = new Map([...(m ? must(m) : []), ...(p ? must(p) : [])].map((x) => [x.id, x.title]));
  const finished = new Set((c ? must(c) : []).filter((x) => x.status === "completed").map((x) => x.id));

  const notices = list.map((n): Notice => {
    const ref = n.reference_id ?? "";
    const { text, href } = describeEvent({ type: n.type, reference_id: n.reference_id, actor: nameOf(n.actor), book: books.get(ref), meeting: meetings.get(ref), finished: finished.has(ref), kind: n.club?.kind });
    // Goes by way of /app/go, which marks it read and switches to its club.
    const go = new URLSearchParams({ n: n.id, ...(n.club && { club: n.club.id }), to: href });
    return { id: n.id, type: n.type, text, href: `/app/go?${go}`, meta: [n.club?.name, fromNow(n.created_at)].filter(Boolean).join(", "), read: n.read_at !== null };
  });
  // Just after the newest one shown: "all" never includes what nobody has seen yet.
  const before = list[0] ? new Date(new Date(list[0].created_at).getTime() + 1).toISOString() : null;
  return { notices, unread: unread.count ?? 0, more: rows.length > limit, before };
}
