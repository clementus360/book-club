import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookLine } from "@/components/book-line";
import { DiscussionSections } from "@/components/discussion";
import { FormDialog } from "@/components/forms/dialog";
import { MeetingLine } from "@/components/meeting-line";
import { Results } from "@/components/results";
import { BookHeader, Fact, Facts, nameOf, Section, Side, WithMargin } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { reopenCycle } from "@/lib/actions/cycles";
import { getActiveCycle, getDiscussion, getMeetings, getNominations, getResults } from "@/lib/data/club";
import { dayRange, formatDate } from "@/lib/dates";
import { cap, words } from "@/lib/kinds";
import { must, requireClub } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const { club } = await requireClub();
  const w = words(club.kind);
  return { title: `${cap(w.a)} we ${w.verbed}` };
}

export default async function ArchivedCycle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, club, clubs, userId, isAdmin } = await requireClub();
  const { data: cycle, error } = await supabase.from("reading_cycles")
    .select("*, book:books!reading_cycles_book_id_fkey(*), decider:profiles!reading_cycles_decided_by_fkey(display_name)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cycle) notFound();
  if (cycle.club_id !== club.id) {
    if (clubs.some((c) => c.id === cycle.club_id)) redirect(`/app/go?club=${cycle.club_id}&to=/app/archive/${id}`);
    notFound();
  }
  if (cycle.status !== "completed" || !cycle.book) redirect("/app/current-book");

  const [nominations, { rounds, results }, meetings, discussion, progress, active] = await Promise.all([
    getNominations(id), getResults(id), getMeetings({ cycleId: id }), getDiscussion(id),
    supabase.from("reading_progress").select("status").eq("cycle_id", id), getActiveCycle(),
  ]);
  const finished = must(progress).filter((p) => p.status === "finished").length;
  const book = cycle.book;
  const others = nominations.filter((n) => n.book_id !== book.id);
  const w = words(club.kind);

  return (
    <>
      <BookHeader book={book} href={`/app/books/${book.id}`} kicker={`${club.name}, ${w.one} ${cycle.number}`}
        facts={dayRange(cycle.reading_starts_at, cycle.completed_at ?? cycle.reading_ends_at, club.timezone)} />
      <WithMargin margin={
        <>
          <Side>
            <Facts>
              <Fact term="Nominations">{nominations.length}</Fact>
              {rounds.map((r) => <Fact key={r.round} term={r.round === 1 ? "Voted" : "Voted in the tie-break"}>{r.ballots_cast} of {r.eligible_voters} members</Fact>)}
              {finished > 0 && <Fact term={`Finished the ${w.one}`}>{finished} {finished === 1 ? "member" : "members"}</Fact>}
              <Fact term="Meetings">{meetings.filter((m) => m.status !== "cancelled").length}</Fact>
              {cycle.completed_at && <Fact term="Finished on">{formatDate(cycle.completed_at, club.timezone)}</Fact>}
            </Facts>
          </Side>
          {isAdmin && !active && (
            <Side>
              <FormDialog trigger={`Reopen this ${w.one}`} triggerClass="btn-text" title={`Reopen this ${w.one}?`} action={reopenCycle} hidden={{ cycle_id: id }} submit="Reopen">
                <p>{`${book.title} becomes the club’s current ${w.one} again. Nothing recorded so far is lost.`}</p>
              </FormDialog>
            </Side>
          )}
        </>
      }>
        <Section title="How it was chosen"><Results kind={club.kind} cycle={cycle} nominations={nominations} rounds={rounds} results={results} decider={cycle.decider?.display_name} /></Section>
        {others.length > 0 && (
          <Section title="Also nominated">
            {others.map((n) => <BookLine key={n.id} book={n.book}><p className="meta">Nominated by {nameOf(n.nominator)}</p>{n.explanation && <p className="written mt-1">{n.explanation}</p>}</BookLine>)}
          </Section>
        )}
        <Section title="Meetings">{meetings.length ? meetings.map((m) => <MeetingLine key={m.id} m={m} />) : <p className="text-soft">No meetings were recorded.</p>}</Section>
        <DiscussionSections data={discussion} ctx={{ clubId: club.id, cycleId: id, userId, isAdmin, zone: club.timezone, clubKind: club.kind }} canReview writable />
      </WithMargin>
    </>
  );
}
