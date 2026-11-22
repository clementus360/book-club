import { NextResponse, type NextRequest } from "next/server";
import { CALENDAR_APPS, subscribeUrl } from "@/lib/calendar";
import { calendarLink } from "@/lib/data/calendar";
import { requireUser } from "@/lib/viewer";

/** Sends the reader to their calendar app, which asks whether to follow their meetings. */
export async function GET(request: NextRequest) {
  await requireUser();
  const app = CALENDAR_APPS.find((a) => a === request.nextUrl.searchParams.get("with"));
  // The private address must only ever leave for a calendar someone has just chosen here.
  const site = request.headers.get("sec-fetch-site");
  if (!app || (site !== null && site !== "same-origin" && site !== "none")) return NextResponse.redirect(new URL("/app/calendar", request.url));
  return NextResponse.redirect(subscribeUrl(app, await calendarLink()), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
