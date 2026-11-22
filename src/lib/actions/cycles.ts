"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { done, explain, failed, isUuid, text, type ActionState } from "@/lib/action";
import { zonedToUtc } from "@/lib/dates";
import { requireUser } from "@/lib/viewer";

const refreshApp = () => revalidatePath("/app", "layout");
const id = (form: FormData, name = "cycle_id") => String(form.get(name));

async function schedule(form: FormData) {
  const { supabase } = await requireUser();
  const { data: club } = await supabase.from("clubs").select("id, timezone").eq("id", id(form, "club_id")).maybeSingle();
  if (!club) return null;
  const at = (name: string) => zonedToUtc(text(form, name), club.timezone);
  return {
    supabase, club,
    dates: {
      p_nomination_opens_at: at("nomination_opens_at"), p_nomination_closes_at: at("nomination_closes_at"),
      p_voting_opens_at: at("voting_opens_at") ?? at("nomination_closes_at"), p_voting_closes_at: at("voting_closes_at"),
      p_reading_starts_at: at("reading_starts_at"), p_reading_ends_at: at("reading_ends_at"),
    },
  };
}

export async function createCycle(_: ActionState | null, form: FormData): Promise<ActionState> {
  const s = await schedule(form);
  if (!s) return failed("That club could not be found.");
  let dates = s.dates;
  if (form.get("simple") === "1") {
    const days = (name: string, max: number) => { const n = Number(form.get(name)); return Number.isInteger(n) && n >= 1 && n <= max ? n : null; };
    const [n, v, r] = [days("nominate_days", 90), days("vote_days", 90), days("read_days", 365)];
    if (!n || !v || !r) return failed("Each step needs a whole number of days: up to 90 to nominate, 90 to vote and 365 to read.");
    const now = Date.now();
    const at = (d: number) => new Date(now + d * 86_400_000).toISOString();
    dates = { p_nomination_opens_at: at(0), p_nomination_closes_at: at(n), p_voting_opens_at: at(n), p_voting_closes_at: at(n + v), p_reading_starts_at: at(n + v), p_reading_ends_at: at(n + v + r) };
  }
  const { error } = await s.supabase.rpc("create_cycle", { p_club_id: s.club.id, ...dates });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function updateSchedule(_: ActionState | null, form: FormData): Promise<ActionState> {
  const s = await schedule(form);
  if (!s) return failed("That club could not be found.");
  const { error } = await s.supabase.rpc("update_cycle_schedule", { p_cycle_id: id(form), ...s.dates });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

type CycleCommand = "open_voting_now" | "close_voting_now" | "confirm_sole_nomination" | "cancel_cycle" | "complete_cycle" | "reopen_cycle";
async function command(name: CycleCommand, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc(name, { p_cycle_id: id(form) });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}
export async function openVoting(_: ActionState | null, form: FormData) { return command("open_voting_now", form); }
export async function closeVoting(_: ActionState | null, form: FormData) { return command("close_voting_now", form); }
export async function confirmSole(_: ActionState | null, form: FormData) { return command("confirm_sole_nomination", form); }
export async function cancelCycle(_: ActionState | null, form: FormData) { return command("cancel_cycle", form); }
export async function reopenCycle(_: ActionState | null, form: FormData) { return command("reopen_cycle", form); }
export async function completeCycle(_: ActionState | null, form: FormData): Promise<ActionState> {
  const result = await command("complete_cycle", form);
  if (!result.ok) return result;
  redirect(`/app/archive/${id(form)}`);
}

export async function reopenNominations(_: ActionState | null, form: FormData): Promise<ActionState> {
  const s = await schedule(form);
  if (!s) return failed("That club could not be found.");
  const { error } = await s.supabase.rpc("reopen_nominations", {
    p_cycle_id: id(form), p_nomination_closes_at: s.dates.p_nomination_closes_at, p_voting_closes_at: s.dates.p_voting_closes_at,
  });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function reopenVoting(_: ActionState | null, form: FormData): Promise<ActionState> {
  const s = await schedule(form);
  if (!s) return failed("That club could not be found.");
  const { error } = await s.supabase.rpc("reopen_voting", { p_cycle_id: id(form), p_closes_at: s.dates.p_voting_closes_at });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function decideSelection(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  if (!isUuid(form.get("nomination_id"))) return failed("Choose one of the books.");
  const { error } = await supabase.rpc("decide_selection", { p_cycle_id: id(form), p_nomination_id: id(form, "nomination_id"), p_reason: text(form, "reason") });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

/** Nominates, or changes an existing nomination when nomination_id is given. */
export async function nominate(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const existing = form.get("nomination_id");
  const explanation = text(form, "explanation");
  if (explanation && explanation.length > 4000) return failed("Please keep the explanation under 4,000 characters.");
  const { error } = isUuid(existing)
    ? await supabase.rpc("update_nomination", { p_nomination_id: existing, p_book_id: id(form, "book_id"), p_explanation: explanation })
    : await supabase.rpc("nominate", { p_cycle_id: id(form), p_book_id: id(form, "book_id"), p_explanation: explanation });
  if (error) return failed(explain(error));
  refreshApp();
  redirect("/app/selection");
}

export async function editNomination(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_nomination", { p_nomination_id: id(form, "nomination_id"), p_book_id: id(form, "book_id"), p_explanation: text(form, "explanation") });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function withdrawNomination(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("withdraw_nomination", { p_nomination_id: id(form, "nomination_id") });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function submitBallot(_: ActionState | null, form: FormData): Promise<ActionState> {
  const ranking = form.getAll("ranking").map(String);
  if (!ranking.length || !ranking.every(isUuid)) return failed("Please put every book in order before you send your vote.");
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("submit_ballot", { p_cycle_id: id(form), p_ranking: ranking });
  if (error) {
    refreshApp(); // if voting closed meanwhile, show that
    return failed(explain(error));
  }
  refreshApp();
  return done("Your vote is in. Only you can see it, and you can change it until voting closes.");
}

export async function saveProgress(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const status = (["not_started", "reading", "finished"] as const).find((s) => s === form.get("status"));
  const whole = (name: string, max: number) => {
    const raw = text(form, name);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
  };
  const [page, percentage] = [whole("current_page", 50_000), whole("percentage", 100)];
  if (!status) return failed("Choose where you are.");
  if (Number.isNaN(page) || Number.isNaN(percentage)) return failed("Pages and percentages should be whole numbers.");
  const { error } = await supabase.from("reading_progress").upsert(
    { cycle_id: id(form), user_id: userId, status, current_page: status === "reading" ? page : null, percentage: status === "reading" ? percentage : null },
    { onConflict: "cycle_id,user_id" },
  );
  if (error) return failed(error.code === "42501" ? "Progress can be updated while the club is reading this book." : explain(error));
  refreshApp();
  return done("Saved.");
}
