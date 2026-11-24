import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { Shell } from "@/components/shell";
import { updatePassword } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPassword() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return (
      <Shell title="That link has expired">
        <Link className="btn btn-primary" href="/forgot-password">Request a new link</Link>
      </Shell>
    );
  }
  return (
    <Shell title="Choose a new password">
      <ActionForm action={updatePassword} hidden={{ then: "app" }}>
        <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        <Field label="New password, again" name="password_again" type="password" autoComplete="new-password" required minLength={8} />
        <Submit className="btn btn-primary w-full">Save password</Submit>
      </ActionForm>
    </Shell>
  );
}
