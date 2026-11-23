import { Hourglass, PenLine, Shapes, Trash2 } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fold } from "@/components/fold";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/dialog";
import { Field, TextArea, TimezoneSelect } from "@/components/forms/fields";
import { PageHeader, Section } from "@/components/ui";
import { closeClub, updateClub } from "@/lib/actions/clubs";
import { cap, describeKind, KINDS, words } from "@/lib/kinds";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Club settings" };

export default async function ClubSettings() {
  const { supabase, club } = await getViewer();
  if (!club) redirect("/app/account");
  const header = (text: string) => <PageHeader kicker={club.name} title="Club settings" action={<Link className="btn btn-plain" href="/app/members"><Labelled>Members</Labelled></Link>}>{text}</PageHeader>;

  if (club.role !== "admin") {
    return (
      <>
        {header("Only administrators can change these.")}
        <Section title="About the club">
        {club.description && <p className="written mb-4 max-w-prose">{club.description}</p>}
        <p className="text-soft">{`${describeKind(club.kind)}. Usually there are ${club.default_nomination_days} days to nominate, ${club.default_voting_days} to vote and ${club.default_reading_days} to ${words(club.kind).verb}.`}</p>
        </Section>
      </>
    );
  }
  const [memberCount, cycleCount, shelfCount] = await Promise.all([
    supabase.from("club_memberships").select("id", { count: "exact", head: true }).eq("club_id", club.id),
    supabase.from("reading_cycles").select("id", { count: "exact", head: true }).eq("club_id", club.id),
    supabase.from("club_books").select("id", { count: "exact", head: true }).eq("club_id", club.id),
  ]);
  const members = memberCount.count ?? 0;
  // The kind can change only while nothing belongs to the club yet.
  const empty = !cycleCount.count && !shelfCount.count;
  return (
    <>
      {header("What you change here changes for everyone in the club.")}
      <Section key={club.id} title="About the club">
        <Fold icon={PenLine} title="Name and description" note="What the club is called, and its timezone.">
          <ClubForm club={club} part="details">
            <Field label="Club name" name="name" required maxLength={80} defaultValue={club.name} />
            <TextArea label="Description" name="description" rows={3} maxLength={2000} defaultValue={club.description ?? ""} />
            <TimezoneSelect defaultValue={club.timezone} label="Club timezone" hint="Used for the club’s deadlines." />
            <Field label="Image address (optional)" name="image_url" type="url" maxLength={1000} defaultValue={club.image_url ?? ""} hint="A link to an image, starting with https://" />
          </ClubForm>
        </Fold>
        <Fold icon={Shapes} title="Kind of club" note={empty ? `${describeKind(club.kind)}. You can change this until something is added.` : `${describeKind(club.kind)}. This is fixed now that the club has started.`}>
          {empty ? (
            <ClubForm club={club} part="kind">
              <fieldset className="mb-5">
                <legend className="label">What the club shares</legend>
                {KINDS.map((k) => <label key={k} className="choice"><input type="radio" name="kind" value={k} defaultChecked={k === club.kind} />{describeKind(k)}</label>)}
              </fieldset>
            </ClubForm>
          ) : <p className="text-soft">{`To share something else, start another club. Everyone can belong to several.`}</p>}
        </Fold>
        <Fold icon={Hourglass} title="How long each step lasts" note={`The usual number of days. You can still change them for each ${words(club.kind).one}.`}>
          <ClubForm club={club} part="lengths">
            <div className="grid grid-cols-2 gap-x-5">
              <Field label="Nominating" name="default_nomination_days" type="number" min={1} max={90} required defaultValue={club.default_nomination_days} />
              <Field label="Voting" name="default_voting_days" type="number" min={1} max={90} required defaultValue={club.default_voting_days} />
              <Field label={cap(words(club.kind).verbing)} name="default_reading_days" type="number" min={1} max={365} required defaultValue={club.default_reading_days} />
              <Field label="Tie-break vote" name="default_runoff_days" type="number" min={1} max={30} required defaultValue={club.default_runoff_days} />
            </div>
          </ClubForm>
        </Fold>
        {members === 1 && (
          <Fold icon={Trash2} title="Close this club" note="Deletes it for good. Only possible while you are its one member.">
            <p className="mb-4 text-soft">{`Its shelf and history will be deleted. ${words(club.kind).mine} will not.`}</p>
            <FormDialog trigger="Close the club" triggerClass="btn btn-danger" title={`Close ${club.name}?`} action={closeClub} hidden={{ club_id: club.id }} submit="Close the club for good" submitClass="btn btn-danger">
              <p className="mb-5">{`This permanently deletes the club’s shelf, ${words(club.kind).many}, meetings and discussion.`}</p>
              <Field label={`Type “${club.name}” to confirm`} name="confirm" required autoComplete="off" />
            </FormDialog>
          </Fold>
        )}
      </Section>
    </>
  );
}

function ClubForm({ club, part, children }: { club: { id: string }; part: "details" | "lengths" | "kind"; children: React.ReactNode }) {
  return <ActionForm action={updateClub} hidden={{ club_id: club.id, part }} className="form">{children}<Submit>Save club settings</Submit></ActionForm>;
}
