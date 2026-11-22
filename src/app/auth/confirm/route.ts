import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "recovery", "email", "email_change", "invite", "magiclink"];

/** Where emailed links land, in either of Supabase's two styles. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNext(params.get("next"), type === "recovery" ? "/reset-password" : "/app");
  const supabase = await createClient();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type && TYPES.includes(type)) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;

  if (ok) return NextResponse.redirect(new URL(next, request.url));
  return NextResponse.redirect(new URL(`/login?problem=${params.get("via") === "google" ? "google" : "link"}`, request.url));
}
