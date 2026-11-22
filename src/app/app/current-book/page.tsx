import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DiscussionSections } from "@/components/discussion";
import { Steps } from "@/components/guide";
import { FormDialog } from "@/components/forms/dialog";
import { MeetingLine } from "@/components/meeting-line";
import { ProgressForm } from "@/components/progress-form";
import { Avatar, BookHeader, nameOf, Section, Side, WithMargin } from "@/components/ui";
import { completeCycle } from "@/lib/actions/cycles";
import { METHOD_LABEL, nextDeadline } from "@/lib/cycle";
import { getActiveCycle, getDiscussion, getMeetings, getMembers } from "@/lib/data/club";
import { getGuide } from "@/lib/data/guide";
import { dayRange, fromNow } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Our book" };

const PROGRESS = { not_started: "Not started", reading: "Reading", finished: "Finished" } as const;

export default async function CurrentBook() {
  const { supabase, club, userId, isAdmin } = await requireClub();
  const cycle = await getActiveCycle();
  // Until there is a book to read, choosing one is what this page is about.
  if (!cycle || cycle.status !== "reading" || !cycle.book) redirect("/app/selection");
  const guide = await getGuide();
  const [members, progress, meetings, discussion] = await Promise.all([
    getMembers(),
    supabase.from("reading_progress").select("*").eq("cycle_id", cycle.id),
    getMeetings({ cycleId: cycle.id }),
    getDiscussion(cycle.id),
  ]);
  const byUser = new Map(must(progress).map((p) => [p.user_id, p]));
  const book = cycle.book;
  const deadline = nextDeadline(cycle);
  const ctx = { clubId: club.id, cycleId: cycle.id, userId, isAdmin, zone: club.timezone };

  return (
    <>
      <BookHeader plain book={book} href={`/app/books/${book.id}`} kicker={`${club.name} is reading`}
        facts={<><p>{dayRange(cycle.reading_starts_at, cycle.reading_ends_at, club.timezone)}</p>{deadline && <p>{deadline.label} {fromNow(deadline.at)}.</p>}</>} />
      <Steps current={guide.current} />
      <WithMargin margin={
        <>
          <Side id="progress"><ProgressForm cycleId={cycle.id} mine={byUser.get(userId) ?? null} /></Side>
          <Side title="Where everyone is">
            <ul className="space-y-3">
              {members.map((m) => {
                const p = byUser.get(m.user_id);
                const detail = p?.status === "reading" ? [p.current_page !== null && `page ${p.current_page}`, p.percentage !== null && `${p.percentage}%`].filter(Boolean).join(", ") : "";
                return (
                  <li key={m.user_id} className="flex items-center gap-3">
                    <Avatar person={m.profile} />
                    <span className="min-w-0"><span className="block truncate">{nameOf(m.profile)}</span><span className="meta block">{PROGRESS[p?.status ?? "not_started"]}{detail && `, ${detail}`}</span></span>
                  </li>
                );
              })}
            </ul>
          </Side>
          <Side>
            <p>{cycle.decision_method && METHOD_LABEL[cycle.decision_method]}.</p>
            <Link className="link" href="/app/selection">See how it was chosen</Link>
          </Side>
          {isAdmin && (
            <Side id="manage">
              <FormDialog trigger="Finish this book" title="Finish this book?" action={completeCycle} hidden={{ cycle_id: cycle.id }} submit="Finish it">
                <p>It moves to Books we have read, with the votes, meetings and everything you wrote. People can still add notes and reviews there. Then you can choose the next book.</p>
              </FormDialog>
            </Side>
          )}
        </>
      }>
        <Section title="Meetings" aside={isAdmin && <Link className="link" href="/app/meetings/new">Arrange a meeting</Link>}>
          {meetings.length ? meetings.map((m) => <MeetingLine key={m.id} m={m} />) : <p className="text-soft">No meeting has been arranged for this book yet.</p>}
        </Section>
        <DiscussionSections data={discussion} ctx={ctx} canReview writable />
      </WithMargin>
    </>
  );
}
