import { after, NextResponse, type NextRequest } from "next/server";
import { sendPendingEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Called by the database's clock when there is email to send. */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const { data: ok, error } = await createAdminClient().rpc("check_email_secret", { p_secret: secret });
  if (error) return NextResponse.json({}, { status: 503 });
  if (!ok) return NextResponse.json({}, { status: 401 });
  // Answer at once; the database does not wait for the sending.
  after(async () => {
    try { await sendPendingEmail(); } catch (e) { console.error("[commonplace] email:", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
