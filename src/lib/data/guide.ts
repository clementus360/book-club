import "server-only";
import { cache } from "react";
import { nextDeadline } from "@/lib/cycle";
import { nextStep, stepOf, type GuideInput } from "@/lib/guide";
import { must, requireClub } from "@/lib/viewer";
import { getActiveCycle, getMeetings, getMembers } from "./club";
import { getOpenPolls } from "./polls";

/** Everything needed to say where the club is and what this person could do next. */
export const getGuide = cache(async () => {
  const { supabase, club, userId, isAdmin } = await requireClub();
  const [cycle, members, meetings, polls] = await Promise.all([getActiveCycle(), getMembers(), getMeetings(), getOpenPolls()]);
  const asking = polls.filter((p) => p.times > 0);
  const poll = asking.find((p) => !p.mine) ?? asking[0];
  const status = cycle?.status ?? null;
  const about = meetings.filter((m) => cycle && m.cycle_id === cycle.id && m.status !== "cancelled");
  const upcoming = about.find((m) => m.status === "scheduled" && new Date(m.starts_at).getTime() > Date.now());
  const voting = status === "voting" || status === "runoff";

  const [nominations, votes, count, progress, answer, review, read] = await Promise.all([
    cycle ? supabase.from("nominations").select("nominated_by").eq("cycle_id", cycle.id).is("withdrawn_at", null) : null,
    cycle && voting ? supabase.from("votes").select("round").eq("cycle_id", cycle.id).eq("user_id", userId) : null,
    cycle && voting ? supabase.rpc("ballot_count", { p_cycle_id: cycle.id }) : null,
    cycle && status === "reading" ? supabase.from("reading_progress").select("status").eq("cycle_id", cycle.id).eq("user_id", userId).maybeSingle() : null,
    upcoming ? supabase.from("meeting_attendees").select("id").eq("meeting_id", upcoming.id).eq("user_id", userId).maybeSingle() : null,
    cycle && status === "reading" ? supabase.from("book_reviews").select("id").eq("cycle_id", cycle.id).eq("created_by", userId).maybeSingle() : null,
    cycle ? null : supabase.from("reading_cycles").select("id", { count: "exact", head: true }).eq("club_id", club.id).eq("status", "completed"),
  ]);
  const noms = nominations ? must(nominations) : [];
  const input: GuideInput = {
    status, isAdmin, members: members.length, everRead: (read?.count ?? 0) > 0,
    nominations: noms.length, iNominated: noms.some((n) => n.nominated_by === userId),
    votes: count ? (must(count) as { cast: number }).cast : 0,
    iVoted: votes ? must(votes).some((v) => v.round === (status === "runoff" ? 2 : 1)) : false,
    deadline: cycle ? nextDeadline(cycle) : null,
    myProgress: progress?.data?.status ?? null,
    meeting: upcoming ? { id: upcoming.id, title: upcoming.title, answered: Boolean(answer?.data), startsAt: upcoming.starts_at } : null,
    met: about.some((m) => m.status === "completed" || (m.status === "scheduled" && m !== upcoming)),
    iReviewed: Boolean(review?.data),
    poll: poll ? { id: poll.id, answered: poll.mine, everyone: poll.answered >= poll.members } : null,
  };
  // Hold "met" back while another meeting about this book is still to come.
  if (upcoming) input.met = false;
  return { input, step: nextStep(input), current: stepOf(status, input.met) };
});
