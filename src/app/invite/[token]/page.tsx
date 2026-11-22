import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Shell } from "@/components/shell";
import { acceptInvitation } from "@/lib/actions/clubs";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Preview =
  | { status: "pending"; club_name: string; invited_by: string | null; expires_at: string }
  | { status: "already_member"; club_id: string; club_name: string }
  | { status: "used" | "revoked" | "expired" | "invalid" };

const PROBLEMS = {
  used: ["This invitation has been used", "Each link admits one person. Ask your friend for a new one."],
  revoked: ["This invitation was withdrawn", "If you think that was a mistake, ask your friend for a new link."],
  expired: ["This invitation has expired", "Links last for seven days. Ask your friend for a new one."],
  invalid: ["This link is not valid", "Check that the whole link was copied, or ask for a new one."],
} as const;

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.rpc("preview_invitation", { p_token: token }),
    supabase.auth.getClaims(),
  ]);
  if (error) throw new Error(error.message);
  const preview = data as unknown as Preview;
  const next = encodeURIComponent(`/invite/${token}`);

  if (preview.status === "pending") {
    return (
      <Shell kicker={`An invitation${preview.invited_by ? ` from ${preview.invited_by}` : ""}`} title={`Join ${preview.club_name}`}
        lede="A private book club on Commonplace, where you choose books together, read them, and talk about them in person.">
        {auth?.claims ? (
          <ActionForm action={acceptInvitation} hidden={{ token }}>
            <Submit pending="Joining…">Join the club</Submit>
          </ActionForm>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-primary" href={`/signup?next=${next}`}>Create an account to join</Link>
            <Link className="btn btn-plain" href={`/login?next=${next}`}>I have an account</Link>
          </div>
        )}
        <p className="meta mt-5">This invitation is for one person and is good until {formatDate(preview.expires_at)}.</p>
      </Shell>
    );
  }
  if (preview.status === "already_member") {
    return (
      <Shell title={`You already belong to ${preview.club_name}`} lede="The invitation has not been used up, so you can still pass it on.">
        <Link className="btn btn-primary" href={`/app/go?club=${preview.club_id}&to=/app`} prefetch={false}>Go to the club</Link>
      </Shell>
    );
  }
  return (
    <Shell title={PROBLEMS[preview.status][0]} lede={PROBLEMS[preview.status][1]}>
      <Link className="btn btn-plain" href="/">About Commonplace</Link>
    </Shell>
  );
}
