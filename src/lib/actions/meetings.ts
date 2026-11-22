"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { done, explain, failed, isUuid, text, type ActionState } from "@/lib/action";
import { isTimeZone, zonedToUtc } from "@/lib/dates";
import { requireUser } from "@/lib/viewer";

const refreshApp = () => revalidatePath("/app", "layout");

function readMeeting(form: FormData) {
  const title = text(form, "title");
  const zone = form.get("timezone");
  if (!title || title.length > 160) return { error: "Give the meeting a title of up to 160 characters." };
  if (!isTimeZone(zone)) return { error: "Choose a timezone." };
  const starts_at = zonedToUtc(text(form, "starts_at"), zone);
  if (!starts_at) return { error: "Choose a date and a start time." };
  const leader = form.get("discussion_leader_id");
  const cycle = form.get("cycle_id");
  return {
    row: {
      title, timezone: zone, starts_at, location: text(form, "location"), description: text(form, "description"), agenda: text(form, "agenda"),
      discussion_leader_id: isUuid(leader) ? leader : null, cycle_id: isUuid(cycle) ? cycle : null,
    },
  };
}

export async function createMeeting(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const read = readMeeting(form);
  if (!read.row) return failed(read.error);
  const { data, error } = await supabase.from("meetings").insert({ ...read.row, club_id: String(form.get("club_id")) }).select("id").single();
  if (error) return failed(error.code === "42501" ? "Only a club administrator can do that." : explain(error));
  refreshApp();
  redirect(`/app/meetings/${data.id}`);
}

export async function updateMeeting(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const read = readMeeting(form);
  if (!read.row) return failed(read.error);
  const meeting = String(form.get("meeting_id"));
  const { data, error } = await supabase.from("meetings").update(read.row).eq("id", meeting).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only a club administrator can do that.");
  refreshApp();
  redirect(`/app/meetings/${meeting}`);
}

export async function setMeetingStatus(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const status = (["scheduled", "completed", "cancelled"] as const).find((s) => s === form.get("status"));
  if (!status) return failed("Choose a status.");
  const { data, error } = await supabase.from("meetings").update({ status }).eq("id", String(form.get("meeting_id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only a club administrator can do that.");
  refreshApp();
  return done();
}

export async function setAttendance(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const answer = (["going", "maybe", "not_going"] as const).find((s) => s === form.get("attendance"));
  if (!answer) return failed("Choose an answer.");
  const { error } = await supabase.from("meeting_attendees").upsert(
    { meeting_id: String(form.get("meeting_id")), user_id: userId, attendance_status: answer }, { onConflict: "meeting_id,user_id" });
  if (error) return failed(error.code === "42501" ? "This meeting is no longer taking answers." : explain(error));
  refreshApp();
  return done();
}

export async function saveOutcomes(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("record_meeting_outcomes", {
    p_meeting_id: String(form.get("meeting_id")), p_outcomes: text(form, "outcomes"), p_completed: form.get("completed") === "on",
  });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Meeting record saved.");
}

export async function addQuestion(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const question = text(form, "question");
  if (!question || question.length > 2000) return failed("Write a question of up to 2,000 characters.");
  const { error } = await supabase.from("discussion_questions").insert({ club_id: String(form.get("club_id")), cycle_id: String(form.get("cycle_id")), question });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function addNote(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const content = text(form, "content");
  if (!content || content.length > 10_000) return failed("Write something, up to 10,000 characters.");
  const [cycle, meeting] = [form.get("cycle_id"), form.get("meeting_id")];
  const { error } = await supabase.from("discussion_notes").insert({
    club_id: String(form.get("club_id")), cycle_id: isUuid(cycle) ? cycle : null, meeting_id: isUuid(meeting) ? meeting : null,
    kind: form.get("kind") === "quotation" ? "quotation" : "note", content, source: text(form, "source"),
  });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function editNote(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const content = text(form, "content");
  if (!content || content.length > 10_000) return failed("Write something, up to 10,000 characters.");
  const { data, error } = await supabase.from("discussion_notes").update({ content, source: text(form, "source") }).eq("id", String(form.get("id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only its author can edit that.");
  refreshApp();
  return done();
}

export async function editQuestion(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const question = text(form, "question");
  if (!question || question.length > 2000) return failed("Write a question of up to 2,000 characters.");
  const { data, error } = await supabase.from("discussion_questions").update({ question }).eq("id", String(form.get("id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only its author can edit that.");
  refreshApp();
  return done();
}

export async function saveClubReview(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const rating = Number(form.get("rating")) || null;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return failed("Choose a rating from 1 to 5.");
  const { error } = await supabase.rpc("save_club_review", { p_cycle_id: String(form.get("cycle_id")), p_rating: rating, p_text: text(form, "review_text") });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Your club review is saved. Everyone in the club can read it.");
}

export async function deleteRecord(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const table = (["discussion_questions", "discussion_notes", "book_reviews"] as const).find((t) => t === form.get("table"));
  if (!table) return failed("That could not be found.");
  const { data, error } = await supabase.from(table).delete().eq("id", String(form.get("id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only its author or an administrator can remove that.");
  refreshApp();
  return done();
}
