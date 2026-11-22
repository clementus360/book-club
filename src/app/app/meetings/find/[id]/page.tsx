import { CalendarSearch, MapPin, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/dialog";
import { Field } from "@/components/forms/fields";
import { Empty, Fact, Facts, nameOf, PageHeader, Section, Side, WithMargin } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { addPollTime, answerPoll, chooseTime, stopPoll } from "@/lib/actions/polls";
import { getMembers } from "@/lib/data/club";
import { formatTime, formatWeekday, fromNow, isAhead, zoneLabel } from "@/lib/dates";
import { answeredAll, POLL_ANSWERS, rankTimes } from "@/lib/poll";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Find a date" };

export default async function FindDatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, club, clubs, userId, isAdmin } = await requireClub();
  const { data: poll, error } = await supabase.from("meeting_polls")
    .select("*, asker:profiles!meeting_polls_created_by_fkey(display_name)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!poll) notFound();
  if (poll.club_id !== club.id) {
    if (clubs.some((c) => c.id === poll.club_id)) redirect(`/app/go?club=${poll.club_id}&to=/app/meetings/find/${id}`);
    notFound();
  }
  if (poll.meeting_id) redirect(`/app/meetings/${poll.meeting_id}`);
  if (poll.status !== "open") return <><PageHeader kicker={club.name} title={poll.title} /><Empty icon={CalendarSearch} title="This was stopped">No time was chosen.</Empty></>;

  const [timeRows, answerRows, members] = await Promise.all([
    supabase.from("meeting_poll_times").select("id, starts_at").eq("poll_id", id).order("starts_at"),
    supabase.from("meeting_poll_answers").select("time_id, user_id, answer").eq("poll_id", id),
    getMembers(),
  ]);
  const answers = must(answerRows);
  const times = must(timeRows).filter((t) => isAhead(t.starts_at));
  const ids = members.map((m) => m.user_id);
  const name = new Map(members.map((m) => [m.user_id, nameOf(m.profile)]));
  const done = times.length ? answeredAll(times, answers, ids) : [];
  const waiting = ids.filter((m) => !done.includes(m));
  const mine = new Map(answers.filter((a) => a.user_id === userId).map((a) => [a.time_id, a.answer]));
  const at = (iso: string) => `${formatWeekday(iso, poll.timezone)}, ${formatTime(iso, poll.timezone)}`;

  return (
    <>
      <PageHeader icon={CalendarSearch} kicker="Finding a date" title={poll.title}>{isAdmin ? "Choose a time whenever you are ready. You do not have to wait for everyone." : "Say which times suit you. An administrator then chooses one, and you will be told."}</PageHeader>
      <WithMargin margin={
        <>
          <Side>
            <Facts>
              <Fact icon={Users} term="Answered">{done.length} of {members.length} {members.length === 1 ? "member" : "members"}</Fact>
              {times.length > 0 && waiting.length > 0 && <Fact term="Still to answer">{waiting.map((m) => name.get(m)).join(", ")}</Fact>}
              <Fact icon={MapPin} term="Where">{poll.location ?? "To be decided"}</Fact>
              <Fact icon={UserRound} term="Asked by">{nameOf(poll.asker)}<span className="meta block">{fromNow(poll.created_at)}</span></Fact>
            </Facts>
          </Side>
          {isAdmin && (
            <Side>
              <div className="flex flex-col items-start gap-3">
                <FormDialog trigger="Suggest another time" title="Suggest another time" action={addPollTime} hidden={{ poll_id: id, timezone: poll.timezone }} submit="Add this time">
                  <Field label="Date and start time" name="starts_at" type="datetime-local" required hint={`Everyone will be asked about it. ${zoneLabel(poll.timezone)}`} />
                </FormDialog>
                <FormDialog trigger="Stop looking for a date" triggerClass="btn-text danger" title="Stop looking for a date?" action={stopPoll} hidden={{ poll_id: id }} submit="Stop" submitClass="btn btn-danger">
                  <p>No meeting is made, and people’s answers are no longer shown. You can start again with other times.</p>
                </FormDialog>
              </div>
            </Side>
          )}
        </>
      }>
        {times.length === 0 ? (
          <Section title="When can you come?"><p className="text-soft">All of these times have passed. {isAdmin ? "Suggest another time, or stop looking." : "An administrator can suggest others."}</p></Section>
        ) : (
          <>
            <Section title="When can you come?" note={`Times in ${zoneLabel(poll.timezone, times[0]!.starts_at)}`}>
              <ActionForm action={answerPoll} hidden={{ poll_id: id }}>
                <div className="mb-6">
                  {times.map((t) => (
                    <fieldset key={t.id} className="row-sm sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-6">
                      <legend className="contents"><span className="font-serif text-lg leading-snug">{at(t.starts_at)}</span></legend>
                      <div className="mt-1 flex flex-wrap gap-x-5 sm:mt-0">
                        {POLL_ANSWERS.map(([value, label]) => (
                          <label key={value} className="choice items-center"><input type="radio" className="!mt-0" name={`answer_${t.id}`} value={value} required defaultChecked={mine.get(t.id) === value} />{label}</label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                <Submit>{mine.size ? "Update my answers" : "Send my answers"}</Submit>
              </ActionForm>
            </Section>
            <Section title="What suits the club" note="Best first. Everyone in the club can see this.">
              {answers.length === 0 ? <p className="text-soft">Nobody has answered yet.</p> : (
                <ul>
                  {rankTimes(times, answers, ids).map((t) => (
                    <li key={t.id} className="row-sm flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-serif text-lg leading-snug">{at(t.starts_at)}{t.best && <span className="rubric ml-3">Suits most</span>}</p>
                        <p className="meta">{POLL_ANSWERS.filter(([a]) => t.people[a].length).map(([a, label]) => `${label}: ${t.people[a].map((m) => name.get(m)).join(", ")}`).join(". ") || "No answers yet"}</p>
                      </div>
                      {isAdmin && (
                        <FormDialog trigger="Choose this time" triggerClass="btn-text" title="Arrange the meeting?" action={chooseTime} hidden={{ time_id: t.id }} submit="Arrange it">
                          <p>{poll.title}, {at(t.starts_at)}. Everyone will be told. People’s answers to this time become their answers to the meeting, and they can change them.</p>
                        </FormDialog>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </WithMargin>
    </>
  );
}
