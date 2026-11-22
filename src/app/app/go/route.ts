import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/action";
import { CLUB_COOKIE, getViewer } from "@/lib/viewer";

/** Opens a page in a particular club, switching to it first if the reader belongs to it. */
export async function GET(request: NextRequest) {
  const { clubs } = await getViewer();
  const params = request.nextUrl.searchParams;
  const to = safeNext(params.get("to"));
  const club = clubs.find((c) => c.id === params.get("club"));
  const response = NextResponse.redirect(new URL(club ? to : "/app", request.url));
  if (club) response.cookies.set(CLUB_COOKIE, club.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:", path: "/", maxAge: 31_536_000 });
  return response;
}
