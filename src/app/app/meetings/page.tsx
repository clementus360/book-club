import type { Metadata } from "next";
import Link from "next/link";
import { isUpcoming, MeetingLine } from "@/components/meeting-line";
import { Empty, PageHeader, Section } from "@/components/ui";
import { getMeetings } from "@/lib/data/club";
import { requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Meetings" };

export default async function Meetings() {
  const { club, isAdmin } = await requireClub();
  const meetings = await getMeetings();
  const upcoming = meetings.filter(isUpcoming);
  const past = meetings.filter((m) => !upcoming.includes(m)).reverse();
  const arrange = isAdmin && <Link className="btn btn-primary" href="/app/meetings/new">Arrange a meeting</Link>;
  return (
    <>
      <PageHeader kicker={club.name} title="Meetings" action={meetings.length > 0 && arrange}>When and where you meet to talk about the book. Open one to say whether you are coming.</PageHeader>
      {meetings.length === 0 ? (
        <Empty title="No meetings yet" action={arrange}>{isAdmin ? "Set a date, a place and who will lead the discussion." : "An administrator arranges meetings. You will be able to say whether you are coming."}</Empty>
      ) : (
        <>
          <Section title="Coming up">{upcoming.length ? upcoming.map((m) => <MeetingLine key={m.id} m={m} />) : <p className="text-soft">Nothing is arranged at the moment.</p>}</Section>
          {past.length > 0 && <Section title="Past meetings">{past.map((m) => <MeetingLine key={m.id} m={m} />)}</Section>}
        </>
      )}
    </>
  );
}
