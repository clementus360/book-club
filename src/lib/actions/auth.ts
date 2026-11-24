"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { failed, done, safeNext, text, type ActionState } from "@/lib/action";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { siteUrl, supabaseKey, supabaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CLUB_COOKIE, requireUser } from "@/lib/viewer";

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

type Amr = { method?: string; timestamp?: number }[];
const since = (amr: Amr, methods: string[], seconds: number) =>
  amr.some((a) => a.method && methods.includes(a.method) && typeof a.timestamp === "number" && Date.now() / 1000 - a.timestamp < seconds);

/** Checks a password without touching the session in the cookies. */
async function passwordMatches(email: string, password: string): Promise<boolean | "limited"> {
  const probe = createSupabaseClient(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (!error) return true;
  return error.status === 429 || error.code === "over_request_rate_limit" ? "limited" : false;
}

/**
 * Holding a session is not enough to change how someone signs in. They must
 * give their current password or, with no password yet (as after Google),
 * have signed in within the last few minutes. Returns a message if not.
 */
async function confirmIdentity(supabase: Awaited<ReturnType<typeof createClient>>, amr: Amr, form: FormData): Promise<string | null> {
  const { data: who } = await supabase.auth.getUser();
  const hasPassword = (who.user?.app_metadata?.providers as string[] | undefined)?.includes("email");
  const email = who.user?.email;
  if (hasPassword && email) {
    const current = String(form.get("current_password") ?? "");
    if (!current) return "Enter your current password.";
    const ok = await passwordMatches(email, current);
    if (ok === "limited") return "Too many attempts. Please wait a few minutes and try again.";
    if (!ok) return "That is not your current password. If you have forgotten it, sign out and use “Forgot your password?”.";
    return null;
  }
  return since(amr, ["password", "oauth", "otp", "magiclink"], 15 * 60) ? null : "For your security, sign out and sign in again, then try within 15 minutes.";
}

const amrOf = (claims: Record<string, unknown>) => (Array.isArray(claims.amr) ? claims.amr : []) as Amr;

/** Sets a new password: from a reset link, or from Your account with proof it is you. */
export async function updatePassword(_: ActionState | null, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return failed(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== form.get("password_again")) return failed("Those passwords do not match.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return failed("That link has expired. Request a new one.");
  const amr = amrOf(data.claims);
  if (!since(amr, ["recovery"], 60 * 60)) {
    const problem = await confirmIdentity(supabase, amr, form);
    if (problem) return failed(problem);
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return failed(authMessage(error));
  if (form.get("then") === "app") redirect("/app");
  return done("Password changed.");
}

/** Starts a change of address. It only takes effect once the link sent to it is followed. */
export async function changeEmail(_: ActionState | null, form: FormData): Promise<ActionState> {
  const email = text(form, "email")?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return failed("Please check the email address.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  if (email === String(data.claims.email ?? "").toLowerCase()) return failed("That is already your email address.");
  const problem = await confirmIdentity(supabase, amrOf(data.claims), form);
  if (problem) return failed(problem);
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/app/account` });
  if (error) return failed(authMessage(error));
  return done("Nearly there. Follow the link we have sent to confirm the change. Until then, keep using your current address.");
}

/**
 * Deletes the account and everything personal to it. Clubs are settled by the
 * database as the profile goes (see the account_deletion migration). Typing
 * the email address is the confirmation, since Google accounts have no password.
 */
export async function deleteAccount(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId, email } = await requireUser();
  const typed = text(form, "confirm");
  if (!email || typed?.toLowerCase() !== email.toLowerCase()) return failed("Type your email address exactly as shown to confirm.");

  // Pictures first: once the account is gone, nothing could remove them.
  const { data: files, error: listed } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
  if (listed) console.warn("[commonplace] pictures not listed before deletion:", listed.message);
  if (files?.length) {
    const { error: gone } = await supabase.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
    if (gone) console.warn("[commonplace] pictures not removed before deletion:", gone.message);
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.error("[commonplace] account deletion:", error.message);
    return failed("Your account could not be deleted. Please try again in a moment.");
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  (await cookies()).delete(CLUB_COOKIE);
  redirect("/login?deleted");
}
