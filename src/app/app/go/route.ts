import { NextResponse, type NextRequest } from "next/server";
import { isUuid, safeNext } from "@/lib/action";
import { CLUB_COOKIE, getViewer } from "@/lib/viewer";

/**
 * Opens a page in a particular club, switching to it first if the reader belongs
 * to it. Given a notification, marks that as read on the way.
 */
export async function GET(request: NextRequest) {
  const { supabase, userId, clubs } = await getViewer();
  const params = request.nextUrl.searchParams;
  const to = safeNext(params.get("to"));
  const wanted = params.get("club");
  const club = clubs.find((c) => c.id === wanted);
  const notification = params.get("n");
  // A browser guessing at what will be opened next has not shown anyone anything.
  if (isUuid(notification) && !/prefetch|prerender/.test(request.headers.get("sec-purpose") ?? "")) {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notification).eq("user_id", userId).is("read_at", null);
    if (error) console.error("[commonplace]", error.code, error.message); // still worth opening the page
  }
  const response = NextResponse.redirect(new URL(club || !wanted ? to : "/app", request.url));
  if (club) response.cookies.set(CLUB_COOKIE, club.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:", path: "/", maxAge: 31_536_000 });
  return response;
}
