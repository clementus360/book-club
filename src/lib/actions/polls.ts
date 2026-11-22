"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { done, explain, failed, isUuid, text, type ActionState } from "@/lib/action";
import { isTimeZone, zonedToUtc } from "@/lib/dates";
import { POLL_ANSWERS } from "@/lib/poll";
import { requireUser } from "@/lib/viewer";

const refreshApp = () => revalidatePath("/app", "layout");
const MAX_TIMES = 8;

export async function createPoll(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const zone = form.get("timezone");
  if (!isTimeZone(zone)) return failed("Choose a timezone.");
  const times: string[] = [];
  for (let i = 1; i <= MAX_TIMES; i++) {
    const value = text(form, `time_${i}`);
    if (!value) continue;
    const at = zonedToUtc(value, zone);
    if (!at) return failed("One of those times is not a real date and time.");
    times.push(at);
  }
  const cycle = form.get("cycle_id");
  const { data, error } = await supabase.rpc("create_meeting_poll", {
    p_club_id: String(form.get("club_id")), p_cycle_id: isUuid(cycle) ? cycle : null as unknown as string, p_title: text(form, "title") ?? "",
    p_location: text(form, "location"), p_timezone: zone, p_times: [...new Set(times)],
  });
  if (error) return failed(explain(error));
  refreshApp();
  redirect(`/app/meetings/find/${data}`);
}

export async function answerPoll(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const answers: Record<string, string> = {};
  for (const [key, value] of form) {
    const id = key.startsWith("answer_") ? key.slice(7) : "";
    if (isUuid(id) && POLL_ANSWERS.some(([a]) => a === value)) answers[id] = String(value);
  }
  const { error } = await supabase.rpc("answer_meeting_poll", { p_poll_id: String(form.get("poll_id")), p_answers: answers });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Thank you. You can change your answers until a time is chosen.");
}

export async function addPollTime(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const zone = form.get("timezone");
  const at = isTimeZone(zone) ? zonedToUtc(text(form, "starts_at"), zone) : null;
  if (!at) return failed("Choose a date and a start time.");
  const { error } = await supabase.rpc("add_meeting_poll_time", { p_poll_id: String(form.get("poll_id")), p_starts_at: at });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function chooseTime(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("choose_meeting_time", { p_time_id: String(form.get("time_id")) });
  if (error) return failed(explain(error));
  refreshApp();
  redirect(`/app/meetings/${data}`);
}

export async function stopPoll(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("stop_meeting_poll", { p_poll_id: String(form.get("poll_id")) });
  if (error) return failed(explain(error));
  refreshApp();
  redirect("/app/meetings");
}
