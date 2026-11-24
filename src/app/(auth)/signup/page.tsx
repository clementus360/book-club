import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { GoogleButton } from "@/components/google-button";
import { Shell } from "@/components/shell";
import { safeNext } from "@/lib/action";
import { signUp } from "@/lib/actions/auth";
import { MINIMUM_AGE } from "@/lib/legal";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const to = safeNext(next, "/onboarding");
  return (
    <Shell title="Create an account" lede={to.startsWith("/invite/") ? "Then you can accept your invitation." : "Then start a club, or join one with an invitation link."}>
      <GoogleButton next={to} />
      <ActionForm action={signUp} hidden={{ next: to }}>
        <Field label="Your name" name="display_name" autoComplete="name" required maxLength={80} hint="What your fellow readers will see." />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        <Submit className="btn btn-primary w-full" pending="Creating your account…">Create account</Submit>
      </ActionForm>
      <p className="mt-5 text-sm text-soft">By creating an account you confirm you are {MINIMUM_AGE} or over and agree to the <Link className="link" href="/terms">terms</Link> and <Link className="link" href="/privacy">privacy policy</Link>.</p>
      <p className="mt-8 border-t border-rule pt-6">Already have an account? <Link className="link" href={next ? `/login?next=${encodeURIComponent(to)}` : "/login"}>Sign in</Link></p>
    </Shell>
  );
}
