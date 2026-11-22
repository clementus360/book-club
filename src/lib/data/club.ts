import "server-only";
import { cache } from "react";
import { must, requireClub } from "@/lib/viewer";

const PERSON = "id, display_name, avatar_url";

export const getMembers = cache(async () => {
  const { supabase, club } = await requireClub();
  return must(await supabase.from("club_memberships")
    .select(`user_id, role, joined_at, profile:profiles!club_memberships_user_id_fkey(${PERSON})`)
    .eq("club_id", club.id).order("joined_at"));
});

/** The one cycle under way, if any. */
export const getActiveCycle = cache(async () => {
  const { supabase, club } = await requireClub();
  const result = await supabase.from("reading_cycles").select("*, book:books!reading_cycles_book_id_fkey(*)")
    .eq("club_id", club.id).not("status", "in", "(completed,cancelled)").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
});

export async function getNominations(cycleId: string) {
  const { supabase } = await requireClub();
  return must(await supabase.from("nominations")
    .select(`*, book:books!nominations_book_id_fkey(*), nominator:profiles!nominations_nominated_by_fkey(${PERSON})`)
    .eq("cycle_id", cycleId).is("withdrawn_at", null).order("created_at"));
}

export async function getResults(cycleId: string) {
  const { supabase } = await requireClub();
  const [rounds, results] = await Promise.all([
    supabase.from("vote_rounds").select("*").eq("cycle_id", cycleId).order("round"),
    supabase.from("vote_results").select("*").eq("cycle_id", cycleId).order("score", { ascending: false }),
  ]);
  return { rounds: must(rounds), results: must(results) };
}

export async function getDiscussion(cycleId: string) {
  const { supabase } = await requireClub();
  const [questions, notes, reviews] = await Promise.all([
    supabase.from("discussion_questions").select(`*, author:profiles!discussion_questions_created_by_fkey(${PERSON})`).eq("cycle_id", cycleId).order("created_at"),
    supabase.from("discussion_notes").select(`*, author:profiles!discussion_notes_created_by_fkey(${PERSON})`).eq("cycle_id", cycleId).order("created_at"),
    supabase.from("book_reviews").select(`*, author:profiles!book_reviews_created_by_fkey(${PERSON})`).eq("cycle_id", cycleId).order("created_at"),
  ]);
  return { questions: must(questions), notes: must(notes), reviews: must(reviews) };
}

export async function getMeetings(filter: { cycleId?: string } = {}) {
  const { supabase, club } = await requireClub();
  let query = supabase.from("meetings")
    .select(`*, leader:profiles!meetings_discussion_leader_id_fkey(${PERSON}), cycle:reading_cycles!meetings_cycle_id_club_id_fkey(id, number, book:books!reading_cycles_book_id_fkey(title))`)
    .eq("club_id", club.id).order("starts_at");
  if (filter.cycleId) query = query.eq("cycle_id", filter.cycleId);
  return must(await query);
}

export type Discussion = Awaited<ReturnType<typeof getDiscussion>>;
export type Nomination = Awaited<ReturnType<typeof getNominations>>[number];
