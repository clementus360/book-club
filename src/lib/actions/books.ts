"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, explain, failed, isUuid, text, type ActionState } from "@/lib/action";
import { asIsbn, normalizeLanguage } from "@/lib/books/normalize";
import { readToken } from "@/lib/books/token";
import { FORMAT_LABELS, type BookFormat, type BookRecord } from "@/lib/books/types";
import type { Tables } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isKind, isPlatform, words } from "@/lib/kinds";
import { enrich } from "@/lib/media/enrich";
import { requireUser } from "@/lib/viewer";

const refreshApp = () => revalidatePath("/app", "layout");

export type Candidate = Pick<Tables<"books">, "id" | "title" | "subtitle" | "authors" | "cover_url" | "publication_year" | "publisher" | "language" | "volume_number" | "edition_note" | "metadata_source"> &
  Partial<Pick<Tables<"books">, "kind" | "episodes" | "runtime_minutes" | "play_hours" | "platforms">>;
export type Resolution =
  | { status: "ok"; book: Candidate }
  | { status: "choose"; candidates: Candidate[] }
  | { status: "error"; message: string };

const COLS = "id, title, subtitle, authors, cover_url, publication_year, publisher, language, volume_number, edition_note, metadata_source, kind, episodes, runtime_minutes, play_hours, platforms";

async function load(id: string): Promise<Resolution> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("books").select(COLS).eq("id", id).maybeSingle();
  return data ? { status: "ok", book: data } : { status: "error", message: "That book could not be found." };
}

const sameRecord = (r: BookRecord, b: Tables<"books">) =>
  (r.google_books_id !== null && r.google_books_id === b.google_books_id) ||
  (r.open_library_edition_id !== null && r.open_library_edition_id === b.open_library_edition_id) ||
  (r.isbn_13 !== null && r.isbn_13 === b.isbn_13) ||
  (r.isbn_10 !== null && r.isbn_10 === b.isbn_10) ||
  (r.open_library_work_id !== null && r.open_library_edition_id === null && b.open_library_edition_id === null &&
    r.open_library_work_id === b.open_library_work_id && r.language === b.language);

/** Turns a chosen search result into a catalogue book, asking when it might already be there. */
export async function resolveSearchResult(token: string, separate: boolean): Promise<Resolution> {
  const { supabase } = await requireUser();
  const record = typeof token === "string" ? readToken(token) : null;
  if (!record) return { status: "error", message: "That search result has expired. Please search again." };
  const { data: allowed } = await supabase.rpc("consume_import_quota");
  if (!allowed) return { status: "error", message: "You have added a lot in the last hour. Please try again later." };

  if (!separate) {
    const { data: similar, error } = await supabase.rpc("find_similar_books", { p_book: record });
    if (error) return { status: "error", message: explain(error) };
    if (similar.length && !similar.some((b) => b.metadata_source !== "manual" && sameRecord(record, b))) {
      return { status: "choose", candidates: similar };
    }
  }
  const enriched = await enrich(record);
  const { data: id, error } = await createAdminClient().rpc("import_book", { p_book: enriched, p_force_new: separate });
  if (error) return { status: "error", message: explain(error, `That ${words(record.kind).one} could not be added. You can enter it by hand instead.`) };
  return load(id);
}

const whole = (max: number, message: string) => z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) { ctx.addIssue({ code: "custom", message }); return null; }
  return n;
});
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const manual = z.object({
  kind: z.string().optional().transform((v) => (isKind(v) ? v : "book")),
  title: z.string().trim().min(1, "Please give it a title.").max(500),
  subtitle: optional(500),
  original_title: optional(500),
  authors: z.string().max(1000).optional().transform((v) => (v ?? "").split(/[,;、，\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20)),
  series_title: optional(300),
  volume_number: optional(20),
  edition_note: optional(200),
  publisher: optional(300),
  publication_year: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < -3000 || n > 2200) { ctx.addIssue({ code: "custom", message: "The year should be a whole number." }); return null; }
    return n;
  }),
  page_count: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 50_000) { ctx.addIssue({ code: "custom", message: "The page count should be a whole number." }); return null; }
    return n;
  }),
  episodes: whole(20_000, "The number of episodes should be a whole number."),
  runtime_minutes: whole(3000, "The runtime should be a whole number of minutes."),
  play_hours: whole(5000, "The hours should be a whole number."),
  language: z.string().trim().max(20).optional().transform((v) => (v ? normalizeLanguage(v) ?? v : null)),
  format: z.string().optional().transform((v) => (v && v in FORMAT_LABELS ? (v as BookFormat) : null)),
  isbn: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const isbn = asIsbn(v);
    if (!isbn) ctx.addIssue({ code: "custom", message: "That ISBN does not check out. Leave it blank if you are not sure." });
    return isbn;
  }),
  description: optional(10_000),
  cover_url: z.string().trim().max(1000).optional().transform((v, ctx) => {
    if (!v) return null;
    if (!/^https:\/\//.test(v)) ctx.addIssue({ code: "custom", message: "The cover address needs to start with https://" });
    return v;
  }),
});

function readManual(form: FormData) {
  if (!text(form, "title")) return { error: isKind(form.get("kind")) && form.get("kind") !== "book" ? "Please give it a title." : "A book needs a title." };
  const parsed = manual.safeParse(Object.fromEntries([...form].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details." };
  const { isbn, ...rest } = parsed.data;
  const platforms = form.getAll("platforms").filter(isPlatform);
  return { book: { ...rest, platforms, isbn_10: isbn?.length === 10 ? isbn : null, isbn_13: isbn?.length === 13 ? isbn : null, alternative_titles: [] as string[] } };
}

export async function resolveManual(form: FormData, separate: boolean): Promise<Resolution> {
  const { supabase } = await requireUser();
  const read = readManual(form);
  if (!read.book) return { status: "error", message: read.error };
  if (!separate) {
    const { data: similar, error } = await supabase.rpc("find_similar_books", { p_book: read.book });
    if (error) return { status: "error", message: explain(error) };
    if (similar.length) return { status: "choose", candidates: similar };
  }
  const { data: id, error } = await supabase.rpc("create_manual_book", { p_book: read.book });
  if (error) return { status: "error", message: explain(error) };
  return load(id);
}

export async function updateManualBook(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const read = readManual(form);
  if (!read.book) return failed(read.error);
  const { error } = await supabase.rpc("update_manual_book", { p_book_id: String(form.get("book_id")), p_book: read.book });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Details saved.");
}

// ------------------------------------------------------- personal library

const STATUSES = ["want_to_read", "currently_reading", "read"] as const;
const readStatus = (form: FormData) => STATUSES.find((s) => s === form.get("status")) ?? null;
const date = (form: FormData, name: string) => {
  const v = text(form, name);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

export async function addToLibrary(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const book = form.get("book_id");
  const status = readStatus(form);
  if (!isUuid(book) || !status) return failed("Choose a book and a status.");
  const { error } = await supabase.from("user_books").insert({ user_id: userId, book_id: book, status });
  if (error?.code === "23505") return failed("This book is already in your library.");
  if (error) return failed(explain(error));
  refreshApp();
  redirect(`/app/books/${book}`);
}

export async function updateLibraryEntry(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const status = readStatus(form);
  const [started, finished] = [date(form, "date_started"), date(form, "date_finished")];
  if (!status) return failed("Choose a status.");
  if (started && finished && finished < started) return failed("The finish date is before the start date.");
  const { data, error } = await supabase.from("user_books").update({
    status, date_started: started, date_finished: finished,
    is_favourite: form.get("is_favourite") === "on", private_notes: text(form, "private_notes"),
  }).eq("user_id", userId).eq("book_id", String(form.get("book_id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("That book is not in your library.");
  refreshApp();
  return done("Saved.");
}

export async function savePersonalReview(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const book = String(form.get("book_id"));
  const rating = Number(form.get("rating")) || null;
  const review = text(form, "review_text");
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return failed("Choose a rating from 1 to 5.");
  if (review && review.length > 20_000) return failed("That review is too long.");
  const query = supabase.from("personal_reviews");
  const { error } = !rating && !review
    ? await query.delete().eq("user_id", userId).eq("book_id", book)
    : await query.upsert({ user_id: userId, book_id: book, rating, review_text: review }, { onConflict: "user_id,book_id" });
  if (error?.code === "23503") return failed("Add the book to your library first.");
  if (error) return failed(explain(error));
  refreshApp();
  return done(!rating && !review ? "Review removed." : "Review saved. Only you can see it.");
}

export async function removeFromLibrary(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("user_books").delete().eq("user_id", userId).eq("book_id", String(form.get("book_id")));
  if (error) return failed(explain(error));
  refreshApp();
  redirect("/app/my-library");
}

// ----------------------------------------------- club library, recommendations

export async function addToClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("add_club_book", { p_club_id: String(form.get("club_id")), p_book_id: String(form.get("book_id")) });
  if (error) return failed(explain(error));
  refreshApp();
  redirect("/app/library");
}

export async function removeFromClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_club_book", { p_club_id: String(form.get("club_id")), p_book_id: String(form.get("book_id")) });
  if (error) return failed(explain(error));
  refreshApp();
  redirect("/app/library");
}

export async function recommendBook(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const club = form.get("club_id");
  if (!isUuid(club)) return failed("Choose which club to recommend it to.");
  const { error } = await supabase.rpc("recommend_book", {
    p_club_id: club, p_book_id: String(form.get("book_id")), p_text: text(form, "text"),
    p_share_rating: form.get("share_rating") === "on",
    p_shared_review: form.get("share_review") === "on" ? text(form, "shared_review") : null,
  });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Recommended.");
}

export async function editRecommendation(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const mode = ["keep", "update", "remove"].find((m) => m === form.get("rating_mode")) ?? "keep";
  const { error } = await supabase.rpc("edit_recommendation", {
    p_id: String(form.get("id")), p_text: text(form, "text"), p_rating_mode: mode,
    p_shared_review: form.get("share_review") === "on" ? text(form, "shared_review") : null,
  });
  if (error) return failed(explain(error));
  refreshApp();
  return done("Recommendation updated.");
}

export async function withdrawRecommendation(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("withdraw_recommendation", { p_id: String(form.get("id")) });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}
