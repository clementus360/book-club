import { BookOpen, BookPlus, Vote } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { Ballot } from "@/components/ballot";
import { BookLine } from "@/components/book-line";
import { ActionButton } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/dialog";
import { TextArea } from "@/components/forms/fields";
import { Results } from "@/components/results";
import { Steps } from "@/components/guide";
import { defaultDates, lockedDates, ScheduleFields } from "@/components/schedule-fields";
import { StartChoosing } from "@/components/start-form";
import { Fact, Facts, nameOf, PageHeader, Section, Side, WithMargin } from "@/components/ui";
import { cancelCycle, closeVoting, confirmSole, decideSelection, openVoting, reopenNominations, reopenVoting, updateSchedule, withdrawNomination } from "@/lib/actions/cycles";
import { METHOD_LABEL, nextDeadline, statusLabel } from "@/lib/cycle";
import { cannotPlay, cannotPlayNote, cap, words } from "@/lib/kinds";
import { getActiveCycle, getNominations, getResults } from "@/lib/data/club";
import { getGuide } from "@/lib/data/guide";
import { dayRange, formatDateTime, fromNow } from "@/lib/dates";
import { must, requireClub } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const { club } = await requireClub();
  return { title: `Choosing ${words(club.kind).a}` };
}

export default async function Selection() {
  const { supabase, club, userId, isAdmin } = await requireClub();
  const w = words(club.kind);
  const { one, many, a, verb } = w;
  const cycle = await getActiveCycle();

  const guide = await getGuide();

  if (!cycle) {
    return (
      <>
        <PageHeader kicker={club.name} title={`Choose ${a} together`} plain>{`The club is between ${many}.`}</PageHeader>
        <Steps current={null} kind={club.kind} />
        {isAdmin ? (
          <>
            <p className="mb-5 max-w-prose">{`Everyone nominates one ${one}, then you all vote, and the club ${w.verbs} the winner. Start whenever you are ready. The whole club will be told.`}</p>
            <StartChoosing kind={club.kind} clubId={club.id} defaults={{ nominate: club.default_nomination_days, vote: club.default_voting_days, read: club.default_reading_days }}
              exact={<ScheduleFields dates={defaultDates(club)} zone={club.timezone} kind={club.kind} />} />
          </>
        ) : <p className="max-w-prose">{`There is nothing to do yet. An administrator will start, and you will be told when it is time to nominate ${a}.`}</p>}
      </>
    );
  }

  const [nominations, { rounds, results }, count, ballot, owned] = await Promise.all([
    getNominations(cycle.id),
    getResults(cycle.id),
    supabase.rpc("ballot_count", { p_cycle_id: cycle.id }),
    supabase.from("votes").select("id, round").eq("cycle_id", cycle.id).eq("user_id", userId),
    club.kind === "game" ? supabase.from("club_memberships").select("profile:profiles!club_memberships_user_id_fkey(platforms)").eq("club_id", club.id) : null,
  ]);
  // Game clubs: say when some members have nothing to play a nomination on.
  const platforms = owned ? must(owned).map((m) => m.profile?.platforms ?? []) : [];
  const noteFor = (b: { platforms: string[] }) => (owned ? cannotPlayNote(cannotPlay(b.platforms, platforms)) : null);
  const round = cycle.status === "runoff" ? 2 : 1;
  const myVote = must(ballot).find((v) => v.round === round);
  const rankings = myVote ? must(await supabase.from("vote_rankings").select("nomination_id, rank").eq("vote_id", myVote.id).order("rank")) : [];
  const { cast, eligible } = must(count) as { cast: number; eligible: number };
  const mine = nominations.find((n) => n.nominated_by === userId);
  const deadline = nextDeadline(cycle, club.kind);
  const open = cycle.status === "voting" || cycle.status === "runoff";
  const onBallot = nominations.filter((n) => round === 1 || n.in_runoff);
  const rankOf = new Map(rankings.map((r) => [r.nomination_id, r.rank]));
  const ordered = [...onBallot].sort((a, b) => (rankOf.get(a.id) ?? 99) - (rankOf.get(b.id) ?? 99));
  const finalists = nominations.filter((n) => n.is_finalist);
  const lastRound = rounds.at(-1);
  const hidden = { cycle_id: cycle.id, club_id: club.id };
  const soon = defaultDates({ ...club, default_nomination_days: Math.min(club.default_nomination_days, 3) });
  const started = cycle.status === "reading";

  return (
    <>
      <PageHeader plain={!started} kicker={started ? w.ours : `Choosing ${a}`} title={started ? "How we chose" : cycle.status === "nominating" && mine ? `You have nominated ${a}` : statusLabel(club.kind)[cycle.status]}
        action={cycle.status === "nominating" && !mine && <Link className="btn btn-primary" href="/app/add-book?to=nominate"><Labelled>{`Nominate ${a}`}</Labelled></Link>}>
        {cycle.status === "nominating" && <p>{mine ? "You can change or withdraw it until nominations close. Voting comes next." : `Put forward one ${one} for the club to ${verb}. Voting comes next.`}</p>}
        {deadline && !started && <p>{deadline.label} {fromNow(deadline.at)}, on {formatDateTime(deadline.at, club.timezone)}.</p>}
      </PageHeader>
      {!started && <Steps current={guide.current} kind={club.kind} />}

      <WithMargin margin={
        <>
          <Side>
            <Facts>
              {started || <Fact icon={BookPlus} term="Nominations close">{formatDateTime(cycle.nomination_closes_at, club.timezone)}</Fact>}
              {started || <Fact icon={Vote} term="Voting closes">{formatDateTime(cycle.voting_closes_at, club.timezone)}</Fact>}
              {cycle.runoff_closes_at && !started && <Fact icon={Vote} term="Tie-break closes">{formatDateTime(cycle.runoff_closes_at, club.timezone)}</Fact>}
              <Fact icon={BookOpen} term={w.progressing}>{dayRange(cycle.reading_starts_at, cycle.reading_ends_at, club.timezone)}</Fact>
            </Facts>
          </Side>
          {isAdmin && (
            <Side id="manage">
              <div className="flex flex-col items-start gap-3">
                {(cycle.status === "nominating" || cycle.status === "nominations_closed") && nominations.length >= 2 && (
                  <FormDialog trigger="Start the vote now" title="Start the vote now?" action={openVoting} hidden={hidden} submit="Start the vote">
                    <p>{`Nominations will close and the vote will begin with the ${nominations.length} ${many} nominated so far.`}</p>
                  </FormDialog>
                )}
                {open && (
                  <FormDialog trigger="Count the votes now" title="Count the votes now?" action={closeVoting} hidden={hidden} submit="Close and count">
                    <p>{cast} of {eligible} members have voted. Voting will close and everyone will see the result. This cannot be undone.</p>
                  </FormDialog>
                )}
                <details className="w-full">
                  <summary className="btn-text inline-flex items-center"><Labelled>For administrators</Labelled></summary>
                  <div className="mt-2 flex flex-col items-start gap-3">
                {["nominations_closed", "voting", "runoff", "awaiting_decision"].includes(cycle.status) && (
                  <FormDialog trigger="Give more time to nominate" title="Give more time to nominate?" action={reopenNominations} hidden={hidden} submit="Open nominations again" submitClass="btn btn-danger">
                    <p className="mb-5">{`Members will be able to nominate again. Any votes already sent will be cleared, because the list of ${many} may change.`}</p>
                    <ScheduleFields dates={soon} zone={club.timezone} only={["nomination_closes_at", "voting_closes_at"]} />
                  </FormDialog>
                )}
                {cycle.status === "awaiting_decision" && lastRound?.ballots_cast === 0 && (
                  <FormDialog trigger="Open voting again" title="Open voting again?" action={reopenVoting} hidden={hidden} submit="Open voting again">
                    <p className="mb-5">{`Nobody voted, so the same ${many} can go to a vote again.`}</p>
                    <ScheduleFields dates={soon} zone={club.timezone} only={["voting_closes_at"]} />
                  </FormDialog>
                )}
                <FormDialog trigger="Change the dates" title="Change the dates" action={updateSchedule} hidden={hidden} submit="Save dates">
                  <ScheduleFields dates={cycle} zone={club.timezone} locked={lockedDates(cycle)} kind={club.kind} />
                </FormDialog>
                <FormDialog trigger={started ? `Stop ${w.verbing} this ${one}` : `Stop choosing this ${one}`} triggerClass="btn-text danger" title={started ? `Stop ${w.verbing} this ${one}?` : "Stop choosing?"} action={cancelCycle} hidden={hidden} submit="Stop and start afresh" submitClass="btn btn-danger">
                  <p>{`The club will be between ${many} again and can start afresh. `}{started ? `This ${one} will not appear among the ${many} you have ${w.verbed}. To keep a record of it, use Finish this ${one} instead.` : "The nominations so far will be put aside."}</p>
                </FormDialog>
                  </div>
                </details>
              </div>
            </Side>
          )}
        </>
      }>
        {started && cycle.book && (
          <Section title={cycle.book.title} aside={<Link className="link" href="/app/current-book"><Labelled>{`Back to the ${one}`}</Labelled></Link>}>
            {rounds.length ? <Results kind={club.kind} cycle={cycle} nominations={nominations} rounds={rounds} results={results} /> : <p className="text-soft">{cycle.decision_method && METHOD_LABEL[cycle.decision_method]}. {cycle.decision_reason}</p>}
          </Section>
        )}

        {open && (
          <Section id="vote" title={myVote ? "Your vote" : `Put the ${many} in order`} aside={<span className="meta">{cast} of {eligible} members have voted</span>}>
            <p className="mb-5 max-w-prose text-soft">
              {cycle.status === "runoff" && `The vote was tied, so there is a second vote between these ${many}. `}
              {`Use the arrows to move the ${one} you most want to ${verb} to the top. `}{myVote ? "Your vote is in, and you can change it until voting closes." : "Then send your vote."} Nobody else can see it.
            </p>
            <Ballot kind={club.kind} key={`${round}-${myVote?.id ?? ""}`} cycleId={cycle.id} submitted={Boolean(myVote)} entries={ordered.map((n) => ({ id: n.id, book: n.book, note: noteFor(n.book) }))} />
          </Section>
        )}

        {cycle.status === "awaiting_decision" && (
          <Section title={lastRound?.ballots_cast ? "It is still a tie" : "Nobody voted"}>
            <p className="max-w-prose text-soft">{lastRound?.ballots_cast ? `The ${many} below are level even after the tie-break vote. ` : "Nobody voted, so there is no result. "}An administrator agrees it with the group and writes down how it was decided.</p>
            {isAdmin && (
              <div className="mt-5">
                <FormDialog trigger="Record the decision" triggerClass="btn btn-primary" title="Record the decision" action={decideSelection} hidden={hidden} submit={`Choose this ${one}`}>
                  <fieldset className="mb-5">
                    <legend className="label">{`Which ${one}?`}</legend>
                    {finalists.map((n) => <label key={n.id} className="choice"><input type="radio" name="nomination_id" value={n.id} required />{n.book.title}</label>)}
                  </fieldset>
                  <TextArea label="How it was decided" name="reason" required rows={3} maxLength={2000} hint="For example: we drew a title from a hat at the last meeting. The club will see this." />
                </FormDialog>
              </div>
            )}
          </Section>
        )}

        {!started && rounds.length > 0 && <Section title="Results so far"><Results kind={club.kind} cycle={cycle} nominations={nominations} rounds={rounds} results={results} /></Section>}

        {cycle.status === "nominations_closed" && nominations.length < 2 && (
          <Section title={nominations.length ? `Only one ${one} was nominated` : "Nothing was nominated"}>
            <p className="max-w-prose text-soft">{nominations.length ? "There is nothing to vote on. An administrator can confirm it as the club’s choice, or give everyone more time, under For administrators." : "An administrator can give everyone more time, under For administrators."}</p>
            {isAdmin && nominations.length === 1 && <div className="mt-5"><ActionButton action={confirmSole} hidden={hidden} className="btn btn-primary">{`${cap(verb)} ${nominations[0]!.book.title}`}</ActionButton></div>}
          </Section>
        )}

        {!started && (
          <Section title="Nominations" aside={<span className="meta">{nominations.length} of {eligible} members</span>}>
            {nominations.length === 0 ? (
              <p className="text-soft">{cycle.status === "scheduled" ? "Nominations have not opened yet." : `No ${many} have been nominated yet.`}</p>
            ) : nominations.map((n) => (
              <BookLine key={n.id} book={n.book} aside={n.nominated_by === userId && cycle.status === "nominating" && (
                <>
                  <Link className="btn-text inline-flex items-center" href={`/app/add-book?to=nominate&book=${n.book_id}`}><Labelled>Edit</Labelled></Link>
                  <Link className="btn-text inline-flex items-center" href="/app/add-book?to=nominate"><Labelled>{`Change ${one}`}</Labelled></Link>
                  <ActionButton action={withdrawNomination} hidden={{ nomination_id: n.id }} className="btn-text danger" pending="Withdrawing…">Withdraw</ActionButton>
                </>
              )}>
                <p className="meta">Nominated by {n.nominated_by === userId ? "you" : nameOf(n.nominator)}</p>
                {noteFor(n.book) && <p className="meta text-rubric">{noteFor(n.book)}</p>}
                {n.explanation && <p className="written mt-1.5 max-w-prose">{n.explanation}</p>}
              </BookLine>
            ))}
          </Section>
        )}
      </WithMargin>
    </>
  );
}
