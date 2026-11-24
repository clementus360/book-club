import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { Shell } from "@/components/shell";
import { requestReset } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPassword() {
  return (
    <Shell title="Reset your password" lede="We will email you a link to choose a new one.">
      <ActionForm action={requestReset}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Submit className="btn btn-primary w-full" pending="Sending…">Send the link</Submit>
      </ActionForm>
      <p className="mt-8 border-t border-rule pt-6"><Link className="link" href="/login">Back to sign in</Link></p>
    </Shell>
  );
}
