import { BookOpen, CalendarDays, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { nameOf } from "@/components/ui";
import type { getMeetings } from "@/lib/data/club";
import { formatTime, formatWeekday, zoneLabel } from "@/lib/dates";

export type MeetingRow = Awaited<ReturnType<typeof getMeetings>>[number];

/** Still "upcoming" for a few hours after it starts. */
export const isUpcoming = (m: Pick<MeetingRow, "status" | "starts_at">) =>
  m.status === "scheduled" && new Date(m.starts_at).getTime() > Date.now() - 4 * 3_600_000;

export function MeetingLine({ m }: { m: MeetingRow }) {
  return (
    <article className="row">
      <p className={`rubric with-icon ${m.status === "cancelled" ? "line-through" : ""}`}><Icon of={CalendarDays} size="0.95em" />{formatWeekday(m.starts_at, m.timezone)}, {formatTime(m.starts_at, m.timezone)}</p>
      <h3 className="text-lg leading-snug"><Link className="hover:underline underline-offset-4" href={`/app/meetings/${m.id}`}>{m.title}</Link>{m.status === "cancelled" && <span className="meta"> (cancelled)</span>}</h3>
      <p className="meta flex flex-wrap gap-x-4 gap-y-0.5">
        {m.location && <span className="with-icon"><Icon of={MapPin} />{m.location}</span>}
        {m.cycle?.book && <span className="with-icon"><Icon of={BookOpen} />{m.cycle.book.title}</span>}
        {m.leader && <span className="with-icon"><Icon of={UserRound} />led by {nameOf(m.leader)}</span>}
        {!m.location && !m.cycle?.book && !m.leader && zoneLabel(m.timezone, m.starts_at)}
      </p>
    </article>
  );
}
