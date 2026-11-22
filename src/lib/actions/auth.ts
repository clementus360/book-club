"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { failed, done, safeNext, text, type ActionState } from "@/lib/action";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CLUB_COOKIE } from "@/lib/viewer";

const MIN_PASSWORD = 8;

function authMessage(error: { code?: string; message: string; status?: number }): string {
  switch (error.code) {
    case "invalid_credentials": return "That email and password do not match an account.";
    case "email_not_confirmed": return "Please confirm your email address first. Check your inbox for the link.";
    case "user_already_exists":
    case "email_exists": return "There is already an account with that email. Try signing in.";
    case "weak_password": return "Please choose a stronger password.";
    case "same_password": return "That is already your password.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit": return "Too many attempts. Please wait a few minutes and try again.";
    case "validation_failed":
    case "email_address_invalid": return "Please check the email address.";
    case "reauthentication_needed": return "For your security, sign in again before changing your password.";
    case "signup_disabled": return "New accounts are not being accepted at the moment.";
  }
  if (error.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  console.error("[commonplace] auth:", error.code, error.message);
  return "Something went wrong. Please try again in a moment.";
}

export async function signUp(_: ActionState | null, form: FormData): Promise<ActionState> {
  const name = text(form, "display_name");
  const email = text(form, "email");
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"), "/onboarding");
  if (!name || name.length > 80) return failed("Tell us what to call you, in 80 characters or fewer.");
  if (!email) return failed("An email address is needed.");
  if (password.length < MIN_PASSWORD) return failed(`Choose a password of at least ${MIN_PASSWORD} characters.`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: name }, emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return failed(authMessage(error));
  if (data.session) redirect(next);
  return done("Nearly there. If that address is new to us, a confirmation link is on its way to it.");
}

export async function signIn(_: ActionState | null, form: FormData): Promise<ActionState> {
  const email = text(form, "email");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return failed("Enter your email and password.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return failed(authMessage(error));
  redirect(safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(CLUB_COOKIE);
  redirect("/");
}

export async function requestReset(_: ActionState | null, form: FormData): Promise<ActionState> {
  const email = text(form, "email");
  if (!email) return failed("Enter your email address.");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error) return failed(authMessage(error));
  // The same answer whether or not the account exists.
  return done("If there is an account for that address, a reset link is on its way.");
}

export async function updatePassword(_: ActionState | null, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return failed(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== form.get("password_again")) return failed("Those passwords do not match.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return failed("That link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return failed(authMessage(error));
  if (form.get("then") === "app") redirect("/app");
  return done("Password changed.");
}
