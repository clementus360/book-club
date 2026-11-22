import type { Metadata } from "next";
import { Empty, nameOf, PageHeader } from "@/components/ui";
import { markNotificationsRead } from "@/lib/actions/clubs";
import { fromNow } from "@/lib/dates";
import { describeEvent } from "@/lib/events";
import { getViewer, must } from "@/lib/viewer";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications() {
  const { supabase, userId, unread } = await getViewer();
  const list = must(await supabase.from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(display_name), club:clubs!notifications_club_id_fkey(id, name)")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(60));
  return (
    <>
      <PageHeader kicker="Across your clubs" title="Notifications" action={unread > 0 && <form action={markNotificationsRead}><button className="btn btn-plain">Mark all as read</button></form>}>What has happened in your clubs. Select one to open it.</PageHeader>
      {list.length === 0 ? <Empty title="Nothing yet">You will hear about nominations, votes, meetings and recommendations in your clubs.</Empty> : (
        <ul>
          {list.map((n) => {
            const { text, href } = describeEvent({ type: n.type, reference_id: n.reference_id, actor: nameOf(n.actor) });
            return (
              <li key={n.id} className="row-sm">
                {/* A plain link: /app/go switches club, so it must not be prefetched. */}
                <a href={n.club ? `/app/go?club=${n.club.id}&to=${encodeURIComponent(href)}` : href} className="flex gap-3 underline-offset-4 hover:underline">
                  <span className={`mt-2 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-rubric"}`}>{!n.read_at && <span className="sr-only">Unread</span>}</span>
                  <span><span className={n.read_at ? "" : "font-medium"}>{text}</span><span className="meta block">{n.club?.name}{n.club && ", "}{fromNow(n.created_at)}</span></span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
