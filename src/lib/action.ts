import type { PostgrestError } from "@supabase/supabase-js";
import type { Kind } from "./kinds";
import { plain } from "./plain";

export type ActionState = { ok: boolean; message?: string; at?: number };

export const done = (message?: string): ActionState => ({ ok: true, message, at: Date.now() });
export const failed = (message: string): ActionState => ({ ok: false, message, at: Date.now() });

/** Database functions raise P0001 with wording meant for people; nothing else is shown. */
export function explain(error: PostgrestError | { code?: string; message: string }, fallback = "Something went wrong. Please try again.", kind?: Kind | null): string {
  if (error.code === "P0001") return plain(error.message, kind);
  if (error.code === "23505") return "That has already been added.";
  if (error.code === "42501") return "You do not have permission to do that.";
  if (error.code === "23514" || error.code === "22P02") return "Some of those details are not valid. Please check and try again.";
  console.error("[commonplace]", error.code, error.message);
  return fallback;
}

/** Trimmed text from a form; empty becomes null. */
export function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Only same-site paths into the app, so `next` cannot become an open redirect. */
export function safeNext(value: unknown, fallback = "/app"): string {
  return typeof value === "string" && /^\/(app|invite|onboarding|reset-password)(?:[/?]|$)/.test(value) && !value.includes("\\") && !value.includes("//")
    ? value
    : fallback;
}
