import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddNote, Notes } from "@/components/discussion";
import { ActionButton } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/dialog";
import { Checkbox, TextArea } from "@/components/forms/fields";
import { Avatar, Fact, nameOf, PageHeader, Section, Side, WithMargin } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { saveOutcomes, setAttendance, setMeetingStatus } from "@/lib/actions/meetings";
import { getMembers } from "@/lib/data/club";
import { formatTime, formatWeekday, fromNow, zoneLabel } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Meeting" };

const ANSWERS = [["going", "Going"], ["maybe", "Maybe"], ["not_going", "Can’t make it"]] as const;
const PERSON = "id, display_name, avatar_url";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, club, clubs, userId, isAdmin } = await requireClub();
  const { data: meeting, error } = await supabase.from("meetings")
    .select(`*, leader:profiles!meetings_discussion_leader_id_fkey(${PERSON}), cycle:reading_cycles!meetings_cycle_id_club_id_fkey(id, number, status, book:books!reading_cycles_book_id_fkey(id, title))`)
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!meeting) notFound();
  // A link to another of the reader's clubs switches to it rather than mixing the two.
  if (meeting.club_id !== club.id) {
    if (clubs.some((c) => c.id === meeting.club_id)) redirect(`/app/go?club=${meeting.club_id}&to=/app/meetings/${id}`);
    notFound();
  }
  const [members, attendees, notes] = await Promise.all([
    getMembers(),
    supabase.from("meeting_attendees").select("user_id, attendance_status").eq("meeting_id", id),
    supabase.from("discussion_notes").select(`*, author:profiles!discussion_notes_created_by_fkey(${PERSON})`).eq("meeting_id", id).order("created_at"),
  ]);
  const answer = new Map(must(attendees).map((a) => [a.user_id, a.attendance_status]));
  const groups = [...ANSWERS.map(([key, label]) => [label, members.filter((m) => answer.get(m.user_id) === key)] as const), ["No answer yet", members.filter((m) => !answer.has(m.user_id))] as const];
  const mine = answer.get(userId);
  const canWrite = meeting.status !== "cancelled" && (isAdmin || meeting.discussion_leader_id === userId);
  const ctx = { clubId: club.id, cycleId: meeting.cycle_id, meetingId: id, userId, isAdmin, zone: club.timezone };
  const bookHref = meeting.cycle?.status === "completed" ? `/app/archive/${meeting.cycle.id}` : "/app/current-book";

  return (
    <>
      <PageHeader kicker={meeting.status === "cancelled" ? "Cancelled" : meeting.status === "completed" ? "This meeting has taken place" : `Meeting ${fromNow(meeting.starts_at)}`} title={meeting.title}>
        {meeting.cycle?.book && <p>On <Link className="link" href={bookHref}>{meeting.cycle.book.title}</Link></p>}
      </PageHeader>
      <WithMargin margin={
        <>
          {meeting.status === "scheduled" && (
            <Side title="Are you coming?">
              <div className="flex flex-wrap gap-2">
                {ANSWERS.map(([value, label]) => (
                  <ActionButton key={value} action={setAttendance} hidden={{ meeting_id: id, attendance: value }} className={`btn ${mine === value ? "btn-primary" : "btn-plain"}`} pending="…">{label}{mine === value && <span className="sr-only"> (your answer)</span>}</ActionButton>
                ))}
              </div>
            </Side>
          )}
          <Side title="Who is coming">
            <div className="space-y-4">
              {groups.filter(([label, list]) => list.length && (meeting.status === "scheduled" || label !== "No answer yet")).map(([label, list]) => (
                <div key={label}>
                  <h3 className="mb-2 font-sans text-sm text-soft">{label}</h3>
                  <ul className="space-y-3">{list.map((m) => <li key={m.user_id} className="flex items-center gap-3"><Avatar person={m.profile} />{nameOf(m.profile)}</li>)}</ul>
                </div>
              ))}
            </div>
          </Side>
          {isAdmin && (
            <Side>
              <div className="flex flex-col items-start gap-3">
                <Link className="btn btn-plain" href={`/app/meetings/${id}/edit`}>Edit meeting</Link>
                {meeting.status === "scheduled" ? (
                  <FormDialog trigger="Cancel meeting" triggerClass="btn-text danger" title="Cancel this meeting?" action={setMeetingStatus} hidden={{ meeting_id: id, status: "cancelled" }} submit="Cancel the meeting" submitClass="btn btn-danger">
                    <p>Everyone in the club will be notified. The record is kept, and you can restore it.</p>
                  </FormDialog>
                ) : (
                  <ActionButton action={setMeetingStatus} hidden={{ meeting_id: id, status: "scheduled" }}>{meeting.status === "cancelled" ? "Restore meeting" : "Mark as still to come"}</ActionButton>
                )}
              </div>
            </Side>
          )}
        </>
      }>
        <Section title="When and where">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Fact term="When"><span className={`font-serif text-xl leading-snug ${meeting.status === "cancelled" ? "line-through" : ""}`}>{formatWeekday(meeting.starts_at, meeting.timezone)}<br />{formatTime(meeting.starts_at, meeting.timezone)}</span><span className="meta block">{zoneLabel(meeting.timezone, meeting.starts_at)}</span></Fact>
            <Fact term="Where"><span className="font-serif text-xl leading-snug whitespace-pre-line">{meeting.location ?? "To be decided"}</span></Fact>
            <Fact term="Discussion leader">{meeting.discussion_leader_id ? nameOf(meeting.leader) : "To be decided"}</Fact>
          </dl>
        </Section>
        {meeting.description && <Section title="About this meeting"><p className="written max-w-prose">{meeting.description}</p></Section>}
        {meeting.agenda && <Section title="Agenda"><p className="written max-w-prose">{meeting.agenda}</p></Section>}
        <Section title="Meeting notes" note="Thoughts from anyone who was there." aside={meeting.status !== "cancelled" && <AddNote ctx={ctx} kind="note" />}>
          {must(notes).length ? <Notes notes={must(notes)} ctx={ctx} kind="note" /> : <p className="text-soft">No notes yet.</p>}
        </Section>
        {meeting.status !== "cancelled" && (
          <Section title="What came of it" note="The club’s record of the meeting." aside={canWrite && (
            <FormDialog trigger="Write up this meeting" triggerClass="link" title="Write up this meeting" action={saveOutcomes} hidden={{ meeting_id: id }} submit="Save the record">
              <TextArea label="What was said and decided" name="outcomes" rows={7} maxLength={20000} defaultValue={meeting.outcomes ?? ""} hint="Everyone in the club can read this." />
              {meeting.status === "scheduled" && <Checkbox name="completed" label="This meeting has taken place" />}
            </FormDialog>
          )}>
            {meeting.outcomes ? <p className="written max-w-prose">{meeting.outcomes}</p> : <p className="text-soft">Nothing has been written up yet.</p>}
          </Section>
        )}
      </WithMargin>
    </>
  );
}
