import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { GoogleButton } from "@/components/google-button";
import { Shell } from "@/components/shell";
import { safeNext } from "@/lib/action";
import { signIn } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; problem?: string; deleted?: string }> }) {
  const { next, problem, deleted } = await searchParams;
  const to = safeNext(next);
  return (
    <Shell title="Sign in">
      {deleted !== undefined && <p className="notice mb-6" role="status">Your account and everything personal to it have been deleted.</p>}
      {problem === "link" && <p className="notice error mb-6">That link has expired or has already been used. If you were confirming your email, try signing in. Otherwise, ask for a new link.</p>}
      {problem === "google" && <p className="notice error mb-6">Signing in with Google did not finish. Try again, or use your email.</p>}
      <GoogleButton next={to} />
      <ActionForm action={signIn} hidden={{ next: to }}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Submit className="btn btn-primary w-full" pending="Signing in…">Sign in</Submit>
      </ActionForm>
      <div className="mt-8 space-y-2 border-t border-rule pt-6">
        <p>New here? <Link className="link" href={next ? `/signup?next=${encodeURIComponent(to)}` : "/signup"}>Create an account</Link></p>
        <p><Link className="link" href="/forgot-password">Forgotten your password?</Link></p>
      </div>
    </Shell>
  );
}
