import "server-only";
import { cache } from "react";
import { answeredAll } from "@/lib/poll";
import { must, requireClub } from "@/lib/viewer";
import { getMembers } from "./club";

/** Dates being looked for in this club, with what is still needed from whom. */
export const getOpenPolls = cache(async () => {
  const { supabase, club, userId } = await requireClub();
  const polls = must(await supabase.from("meeting_polls").select("id, title, cycle_id, created_at").eq("club_id", club.id).eq("status", "open").order("created_at"));
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);
  const [times, answers, members] = await Promise.all([
    supabase.from("meeting_poll_times").select("id, poll_id, starts_at").in("poll_id", ids).order("starts_at"),
    supabase.from("meeting_poll_answers").select("poll_id, time_id, user_id, answer").in("poll_id", ids),
    getMembers(),
  ]);
  return polls.map((p) => {
    const ahead = must(times).filter((t) => t.poll_id === p.id && Date.parse(t.starts_at) > Date.now());
    const done = ahead.length ? answeredAll(ahead, must(answers).filter((a) => a.poll_id === p.id), members.map((m) => m.user_id)) : [];
    return { ...p, times: ahead.length, answered: done.length, members: members.length, mine: ahead.length === 0 || done.includes(userId) };
  });
});
