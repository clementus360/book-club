import { NextResponse, type NextRequest } from "next/server";
import { checkStop } from "@/lib/email/stop";
import { createAdminClient } from "@/lib/supabase/admin";

/** Turns emails off. Reached from the button on /email/stop, or by a mail app's one-click unsubscribe. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const params = request.nextUrl.searchParams;
  const user = form?.get("u") ?? params.get("u"), signature = form?.get("s") ?? params.get("s");
  if (!checkStop(user, signature)) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  const { error } = await createAdminClient().rpc("set_email_updates", { p_user: user, p_on: false });
  if (error) return NextResponse.json({ error: "Please try again." }, { status: 503 });
  // A person pressing the button gets a page; a mail app gets a plain answer.
  return form?.has("page") ? NextResponse.redirect(new URL("/email/stop?done=1", request.url), 303) : new NextResponse(null, { status: 200 });
}
