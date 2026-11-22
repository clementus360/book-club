import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/action";
import { googleAuth, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Sends someone to Google. They come back to /auth/confirm. */
export async function GET(request: NextRequest) {
  const failed = NextResponse.redirect(new URL("/login?problem=google", request.url));
  if (!googleAuth()) return failed;
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/confirm?via=google&next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" }, // shared computers: never guess which account
    },
  });
  if (error || !data.url) return failed;
  return NextResponse.redirect(data.url);
}
