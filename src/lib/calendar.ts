/** Meetings have a start but no end, so calendars are given two hours. */
import { BRAND } from "@/lib/brand";
export const MEETING_HOURS = 2;

export type CalendarEvent = { title: string; club: string; starts_at: string; location: string | null; url: string };

const compact = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
const endOf = (iso: string) => new Date(new Date(iso).getTime() + MEETING_HOURS * 3_600_000);
// encodeURIComponent, not URLSearchParams: Outlook shows "+" instead of spaces.
const query = (values: Record<string, string>) => Object.entries(values).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const details = (e: CalendarEvent) => `${e.club}\n\n${e.url}`;

/** Opens Google Calendar with the meeting filled in. */
export const googleEvent = (e: CalendarEvent) => `https://calendar.google.com/calendar/render?${query({
  action: "TEMPLATE", text: e.title, dates: `${compact(new Date(e.starts_at))}/${compact(endOf(e.starts_at))}`, details: details(e), location: e.location ?? "",
})}`;

/** Opens Outlook with the meeting filled in. Personal and work accounts live on different sites. */
export const outlookEvent = (e: CalendarEvent, kind: "personal" | "work") =>
  `https://${kind === "work" ? "outlook.office.com" : "outlook.live.com"}/calendar/0/action/compose?${query({
    path: "/calendar/action/compose", rru: "addevent", allday: "false", subject: e.title,
    startdt: new Date(e.starts_at).toISOString(), enddt: endOf(e.starts_at).toISOString(), body: details(e), location: e.location ?? "",
  })}`;

export const CALENDAR_APPS = ["google", "outlook", "work", "apple"] as const;
export type CalendarApp = (typeof CALENDAR_APPS)[number];

/** Where each calendar asks whether to follow a link. Nothing is downloaded. */
export function subscribeUrl(app: CalendarApp, feed: string): string {
  const webcal = feed.replace(/^https?:/, "webcal:");
  switch (app) {
    case "google": return `https://calendar.google.com/calendar/render?${query({ cid: webcal })}`;
    case "outlook": return `https://outlook.live.com/calendar/0/addfromweb?${query({ url: feed, name: BRAND.name })}`;
    case "work": return `https://outlook.office.com/calendar/0/addfromweb?${query({ url: feed, name: BRAND.name })}`;
    case "apple": return webcal;
  }
}

export type FeedMeeting = { id: string; club: string; title: string; starts_at: string; location: string | null; cancelled: boolean; created_at: string; updated_at: string };

const escape = (s: string) => s.replace(/[\\;,]/g, "\\$&").replace(/\r\n?|\n/g, "\\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

/** Lines of at most 75 bytes, never splitting a character. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  let out = "", length = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    if (length + n > 75) { out += "\r\n "; length = 1; }
    out += ch;
    length += n;
  }
  return out;
}

/** An iCalendar file (RFC 5545) of these meetings. */
export function calendarFile(meetings: FeedMeeting[], site: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${BRAND.name}//Meetings//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `NAME:${BRAND.name}`, `X-WR-CALNAME:${BRAND.name}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const m of meetings) {
    const url = `${site}/app/meetings/${m.id}`;
    lines.push("BEGIN:VEVENT", `UID:${m.id}@commonplace`, `DTSTAMP:${compact(new Date(m.updated_at))}`, `LAST-MODIFIED:${compact(new Date(m.updated_at))}`,
      // Grows with every change, which is how calendars know to update.
      `SEQUENCE:${Math.max(0, Math.floor((Date.parse(m.updated_at) - Date.parse(m.created_at)) / 1000))}`,
      `DTSTART:${compact(new Date(m.starts_at))}`, `DTEND:${compact(endOf(m.starts_at))}`, `SUMMARY:${escape(m.title)}`,
      ...(m.location ? [`LOCATION:${escape(m.location)}`] : []), `DESCRIPTION:${escape(`${m.club}\n\n${url}`)}`, `URL:${url}`,
      `STATUS:${m.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map((l) => `${fold(l)}\r\n`).join("");
}
