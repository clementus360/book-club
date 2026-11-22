import { CalendarDays, CalendarSearch } from "lucide-react";
import { Icon, Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { isUpcoming, MeetingLine } from "@/components/meeting-line";
import { Empty, PageHeader, Section } from "@/components/ui";
import { getMeetings } from "@/lib/data/club";
import { getOpenPolls } from "@/lib/data/polls";
import { requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Meetings" };

export default async function Meetings() {
  const { club, isAdmin } = await requireClub();
  const [meetings, polls] = await Promise.all([getMeetings(), getOpenPolls()]);
  const upcoming = meetings.filter(isUpcoming);
  const past = meetings.filter((m) => !upcoming.includes(m)).reverse();
  const arrange = isAdmin && <><Link className="btn btn-primary" href="/app/meetings/new"><Labelled>Arrange a meeting</Labelled></Link><Link className="btn btn-plain" href="/app/meetings/find"><Labelled>Find a date</Labelled></Link></>;
  return (
    <>
      <PageHeader kicker={club.name} title="Meetings" action={(meetings.length > 0 || polls.length > 0) && arrange}>When and where you meet to talk about the book. Open one to say whether you are coming.</PageHeader>
      {polls.length > 0 && (
        <Section title="Finding a date">
          {polls.map((p) => (
            <article key={p.id} className="row">
              <p className="rubric with-icon"><Icon of={CalendarSearch} size="0.95em" />{p.mine ? "You have answered" : "Waiting for your answer"}</p>
              <h3 className="text-lg leading-snug"><Link className="hover:underline underline-offset-4" href={`/app/meetings/find/${p.id}`}>{p.title}</Link></h3>
              <p className="meta">{p.times === 0 ? "All the suggested times have passed" : `${p.times} possible ${p.times === 1 ? "time" : "times"}, ${p.answered} of ${p.members} answered`}</p>
            </article>
          ))}
        </Section>
      )}
      {meetings.length === 0 ? polls.length === 0 && (
        <Empty icon={CalendarDays} title="No meetings yet" action={arrange}>{isAdmin ? "If you know when, arrange it now. If not, find a date that suits everyone." : "An administrator arranges meetings. You will be able to say whether you are coming."}</Empty>
      ) : (
        <>
          <Section title="Coming up" aside={<Link className="link" href="/app/calendar"><Labelled>Add to my calendar</Labelled></Link>}>{upcoming.length ? upcoming.map((m) => <MeetingLine key={m.id} m={m} />) : <p className="text-soft">Nothing is arranged at the moment.</p>}</Section>
          {past.length > 0 && <Section title="Past meetings">{past.map((m) => <MeetingLine key={m.id} m={m} />)}</Section>}
        </>
      )}
    </>
  );
}
