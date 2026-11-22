import { Field } from "@/components/forms/fields";
import { utcToZonedInput, zoneLabel } from "@/lib/dates";
import type { Cycle } from "@/lib/cycle";

type Dates = Pick<Cycle, "nomination_opens_at" | "nomination_closes_at" | "voting_opens_at" | "voting_closes_at" | "reading_starts_at" | "reading_ends_at">;
export type DateKey = keyof Dates;

const LABELS: Record<DateKey, string> = {
  nomination_opens_at: "Nominations open", nomination_closes_at: "Nominations close",
  voting_opens_at: "Voting opens", voting_closes_at: "Voting closes",
  reading_starts_at: "Reading begins", reading_ends_at: "Reading ends",
};

/** Dates that have taken effect are sent along unchanged but cannot be edited. */
export function ScheduleFields({ dates, zone, locked = [], only }: { dates: Dates; zone: string; locked?: DateKey[]; only?: DateKey[] }) {
  return (
    <>
      <div className="grid gap-x-5 sm:grid-cols-2">
        {(Object.keys(LABELS) as DateKey[]).filter((k) => !only || only.includes(k)).map((k) =>
          locked.includes(k)
            ? <input key={k} type="hidden" name={k} value={utcToZonedInput(dates[k], zone)} />
            : <Field key={k} label={LABELS[k]} name={k} type="datetime-local" required defaultValue={utcToZonedInput(dates[k], zone)} className="mb-4" />)}
      </div>
      <p className="hint">Times are in {zoneLabel(zone)}, the club’s timezone.</p>
    </>
  );
}

export function defaultDates(club: { default_nomination_days: number; default_voting_days: number; default_reading_days: number }): Dates {
  const now = new Date();
  now.setUTCSeconds(0, 0);
  const plus = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const n = club.default_nomination_days, v = n + club.default_voting_days;
  return { nomination_opens_at: plus(0), nomination_closes_at: plus(n), voting_opens_at: plus(n), voting_closes_at: plus(v), reading_starts_at: plus(v), reading_ends_at: plus(v + club.default_reading_days) };
}

export function lockedDates(cycle: Cycle): DateKey[] {
  switch (cycle.status) {
    case "scheduled": return [];
    case "nominating": return ["nomination_opens_at"];
    case "nominations_closed": return ["nomination_opens_at", "nomination_closes_at"];
    case "voting": return ["nomination_opens_at", "nomination_closes_at", "voting_opens_at"];
    case "reading": return ["nomination_opens_at", "nomination_closes_at", "voting_opens_at", "voting_closes_at", ...(new Date(cycle.reading_starts_at) > new Date() ? [] : (["reading_starts_at"] as const))];
    default: return ["nomination_opens_at", "nomination_closes_at", "voting_opens_at", "voting_closes_at"];
  }
}
