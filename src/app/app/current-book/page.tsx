import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DiscussionSections } from "@/components/discussion";
import { Steps } from "@/components/guide";
import { FormDialog } from "@/components/forms/dialog";
import { MeetingLine } from "@/components/meeting-line";
import { ProgressForm } from "@/components/progress-form";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { progressDetail, words } from "@/lib/kinds";
import { Avatar, BookHeader, nameOf, Section, Side, WithMargin } from "@/components/ui";
import { completeCycle, setCycleGoal } from "@/lib/actions/cycles";
import { METHOD_LABEL, nextDeadline } from "@/lib/cycle";
import { getActiveCycle, getDiscussion, getMeetings, getMembers } from "@/lib/data/club";
import { getGuide } from "@/lib/data/guide";
import { dayRange, fromNow } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const { club } = await requireClub();
  return { title: words(club.kind).ours };
}

export default async function CurrentBook() {
  const { supabase, club, userId, isAdmin } = await requireClub();
  const w = words(club.kind);
  const PROGRESS = { not_started: "Not started", reading: w.progressing, finished: "Finished" } as const;
  const cycle = await getActiveCycle();
  // Until there is something to read, watch or play, choosing it is what this page is about.
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
  const deadline = nextDeadline(cycle, club.kind);
  const ctx = { clubId: club.id, cycleId: cycle.id, userId, isAdmin, zone: club.timezone, clubKind: club.kind };

  return (
    <>
      <BookHeader plain book={book} href={`/app/books/${book.id}`} kicker={`${club.name} is ${w.verbing}`}
        facts={<><p>{dayRange(cycle.reading_starts_at, cycle.reading_ends_at, club.timezone)}</p>{deadline && <p>{deadline.label} {fromNow(deadline.at)}.</p>}{cycle.goal && <p>By the meeting: {cycle.goal}</p>}</>} />
      <Steps current={guide.current} kind={club.kind} />
      <WithMargin margin={
        <>
          <Side id="progress"><ProgressForm cycleId={cycle.id} mine={byUser.get(userId) ?? null} kind={club.kind} episodes={book.episodes} /></Side>
          <Side title="Where everyone is">
            <ul className="space-y-3">
              {members.map((m) => {
                const p = byUser.get(m.user_id);
                const detail = p ? progressDetail(p) : "";
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
            <Link className="link" href="/app/selection"><Labelled>See how it was chosen</Labelled></Link>
          </Side>
          {isAdmin && (
            <Side id="manage">
              <ActionForm action={setCycleGoal} hidden={{ cycle_id: cycle.id }} className="mb-5">
                <Field label="Goal for the meeting (optional)" name="goal" maxLength={200} defaultValue={cycle.goal ?? ""} hint={w.unit === "episode" ? "For example: up to episode 6." : w.kind === "game" ? "For example: up to the end of chapter 3." : w.kind === "book" ? "For example: up to chapter 10." : "For example: watch it before we meet."} className="mb-3" />
                <Submit className="btn btn-plain">Save goal</Submit>
              </ActionForm>
              <FormDialog trigger={`Finish this ${w.one}`} title={`Finish this ${w.one}?`} action={completeCycle} hidden={{ cycle_id: cycle.id }} submit="Finish it">
                <p>{`It moves to ${w.pastShelf}, with the votes, meetings and everything you wrote. People can still add notes and reviews there. Then you can choose the next ${w.one}.`}</p>
              </FormDialog>
            </Side>
          )}
        </>
      }>
        <Section title="Meetings" aside={isAdmin && <Link className="link" href="/app/meetings/new"><Labelled>Arrange a meeting</Labelled></Link>}>
          {meetings.length ? meetings.map((m) => <MeetingLine key={m.id} m={m} />) : <p className="text-soft">{`No meeting has been arranged for this ${w.one} yet.`}</p>}
        </Section>
        <DiscussionSections data={discussion} ctx={ctx} canReview writable />
      </WithMargin>
    </>
  );
}
