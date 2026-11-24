import { NextResponse, type NextRequest } from "next/server";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

/** Switches the look for this browser, then goes back to where you were. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const back = request.nextUrl.searchParams.get("back");
  // Only a path on this site, never somewhere else.
  const to = back && /^\/(?!\/)[^\\]*$/.test(back) ? back : "/";
  const response = NextResponse.redirect(new URL(to, request.url), 303);
  if (isTheme(name)) response.cookies.set(THEME_COOKIE, name, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  return response;
}
