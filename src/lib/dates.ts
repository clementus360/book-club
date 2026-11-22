/** Offset of `zone` from UTC, in minutes, at a given instant. */
function offsetMinutes(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** "2026-03-01T19:30" on the clock in `zone`, as an ISO instant. Null if malformed. */
export function zonedToUtc(local: string | null, zone: string): string | null {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m || !isTimeZone(zone)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(wall).getUTCDate() !== d || h > 23 || mi > 59) return null;
  // The second pass corrects guesses that land on the other side of a clock change.
  let utc = wall - offsetMinutes(new Date(wall), zone) * 60_000;
  utc = wall - offsetMinutes(new Date(utc), zone) * 60_000;
  return new Date(utc).toISOString();
}

/** The value for a datetime-local input, on the clock in `zone`. */
export function utcToZonedInput(iso: string | Date, zone: string): string {
  const instant = new Date(iso);
  return new Date(instant.getTime() + offsetMinutes(instant, zone) * 60_000).toISOString().slice(0, 16);
}

export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const formatDate = (iso: string | Date, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export const formatDay = (iso: string | Date, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "short" }).format(new Date(iso));

export const formatWeekday = (iso: string | Date, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

export const formatTime = (iso: string | Date, zone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export const formatDateTime = (iso: string | Date, zone = "UTC") => `${formatWeekday(iso, zone)}, ${formatTime(iso, zone)}`;

/** "Africa/Kigali" -> "Kigali (GMT+2)" */
export function zoneLabel(zone: string, at: string | Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(new Date(at)).find((p) => p.type === "timeZoneName")?.value;
  return zone === "UTC" ? "UTC" : `${zone.split("/").pop()!.replace(/_/g, " ")} (${name})`;
}

/** A calendar date (no time, no zone) from a Postgres `date`. */
export const formatPlainDate = (date: string) => formatDate(`${date}T00:00:00Z`, "UTC");

export function fromNow(iso: string | Date, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const say = (n: number, unit: string) => {
    const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
    return diff < 0 ? `${label} ago` : `in ${label}`;
  };
  if (abs < 60_000) return diff < 0 ? "just now" : "in a moment";
  if (abs < 3_600_000) return say(Math.round(abs / 60_000), "minute");
  if (abs < 36 * 3_600_000) return say(Math.round(abs / 3_600_000), "hour");
  return say(Math.round(abs / 86_400_000), "day");
}

export const dayRange = (a: string, b: string, zone = "UTC") => `${formatDay(a, zone)} – ${formatDate(b, zone)}`;
