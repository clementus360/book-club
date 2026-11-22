import { createClient } from "@supabase/supabase-js";
import { calendarFile, type FeedMeeting } from "@/lib/calendar";
import type { Database } from "@/lib/database.types";
import { siteUrl, supabaseKey, supabaseUrl } from "@/lib/env";

/** One reader's meetings, for a calendar app. The address is the only credential. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const token = (await params).file.match(/^([A-Za-z0-9_-]{43})\.ics$/)?.[1];
  const nothing = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!token) return nothing(404);
  const supabase = createClient<Database>(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  // Not a 404: calendars may drop a subscription that is said not to exist.
  if (error) { console.error("[commonplace]", error.code, error.message); return nothing(503); }
  if (data === null) return nothing(404);
  return new Response(calendarFile(data as unknown as FeedMeeting[], siteUrl()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="commonplace.ics"',
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
    },
  });
}
