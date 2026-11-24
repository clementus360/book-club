import { NextResponse } from "next/server";
import { requireUser } from "@/lib/viewer";

/**
 * Everything Commonplace holds about the person, as JSON they can keep or take
 * elsewhere. Read as them, so the database's own rules decide what is theirs.
 */
export async function GET() {
  const { supabase, userId, email } = await requireUser();
  const [profile, clubs, library, recommendations, nominations, votes, progress, attendance, pollAnswers, questions, notes, reviews, notifications] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, email_updates, platforms, created_at").eq("id", userId).maybeSingle(),
    supabase.from("club_memberships").select("role, joined_at, club:clubs!club_memberships_club_id_fkey(name, kind)").eq("user_id", userId),
    supabase.from("user_books").select("*, book:books!user_books_book_id_fkey(title, authors, kind, publication_year)").eq("user_id", userId),
    supabase.from("club_recommendations").select("*").eq("recommended_by", userId),
    supabase.from("nominations").select("*").eq("nominated_by", userId),
    supabase.from("votes").select("*").eq("user_id", userId),
    supabase.from("reading_progress").select("*").eq("user_id", userId),
    supabase.from("meeting_attendees").select("*").eq("user_id", userId),
    supabase.from("meeting_poll_answers").select("*").eq("user_id", userId),
    supabase.from("discussion_questions").select("*").eq("created_by", userId),
    supabase.from("discussion_notes").select("*").eq("created_by", userId),
    supabase.from("book_reviews").select("*").eq("created_by", userId),
    supabase.from("notifications").select("*").eq("user_id", userId),
  ]);
  const parts = { profile, clubs, library, recommendations, nominations, votes, progress, attendance, pollAnswers, questions, notes, reviews, notifications };
  const failed = Object.entries(parts).filter(([, r]) => r.error);
  if (failed.length) {
    console.error("[commonplace] export:", failed.map(([k, r]) => `${k}: ${r.error!.message}`).join("; "));
    return NextResponse.json({ error: "Your data could not be gathered. Please try again in a moment." }, { status: 500 });
  }
  const body = {
    exported_at: new Date().toISOString(),
    account: { email, ...profile.data },
    clubs: clubs.data,
    my_books: library.data,
    recommendations: recommendations.data,
    nominations: nominations.data,
    votes: votes.data,
    progress: progress.data,
    meeting_answers: attendance.data,
    meeting_poll_answers: pollAnswers.data,
    discussion_questions: questions.data,
    discussion_notes: notes.data,
    club_reviews: reviews.data,
    notifications: notifications.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="commonplace-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
