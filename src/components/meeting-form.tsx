import { ActionForm, Submit, type FormAction } from "@/components/forms/action-form";
import { Field, Select, TextArea, TimezoneSelect } from "@/components/forms/fields";
import { nameOf } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { formatDay, utcToZonedInput } from "@/lib/dates";
import { cap, words, type Kind } from "@/lib/kinds";

export type LeaderOption = { id: string; name: string; lastLed: string | null };

export function MeetingForm({ action, hidden, meeting, leaders, cycles, zone, defaultCycle, submit, kind }: {
  action: FormAction; hidden: Record<string, string>; meeting?: Tables<"meetings">; leaders: LeaderOption[];
  cycles: { id: string; number: number; title: string | null }[]; zone: string; defaultCycle?: string | null; submit: string; kind?: Kind;
}) {
  const w = words(kind);
  return (
    <ActionForm action={action} hidden={hidden} className="form">
      <Field label="Title" name="title" required maxLength={160} defaultValue={meeting?.title ?? ""} placeholder="First discussion" />
      <div className="grid gap-x-5 sm:grid-cols-2">
        <Field label="Date and start time" name="starts_at" type="datetime-local" required defaultValue={meeting ? utcToZonedInput(meeting.starts_at, meeting.timezone) : ""} />
        <TimezoneSelect defaultValue={meeting?.timezone ?? zone} hint="Where the meeting takes place." />
      </div>
      <Field label="Location" name="location" maxLength={500} defaultValue={meeting?.location ?? ""} placeholder="Name and address" />
      <details className="mb-5" open={Boolean(meeting)}>
        <summary className="btn-text inline-flex items-center">More details</summary>
        <div className="pt-4">
      <Select label={cap(w.one)} name="cycle_id" defaultValue={meeting ? meeting.cycle_id ?? "" : defaultCycle ?? ""}>
        <option value="">{`Not about a particular ${w.one}`}</option>
        {cycles.map((c) => <option key={c.id} value={c.id}>{c.title ?? `The ${w.one} being chosen now`}</option>)}
      </Select>
      <Select label="Discussion leader" name="discussion_leader_id" defaultValue={meeting?.discussion_leader_id ?? ""} hint="The person who starts the conversation. Those who have led least recently come first.">
        <option value="">To be decided</option>
        {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}{l.lastLed ? ` (last led ${formatDay(l.lastLed, zone)})` : " (has not led yet)"}</option>)}
      </Select>
      <TextArea label="Description (optional)" name="description" rows={3} maxLength={4000} defaultValue={meeting?.description ?? ""} />
      <TextArea label="Agenda (optional)" name="agenda" rows={5} maxLength={8000} defaultValue={meeting?.agenda ?? ""} />
        </div>
      </details>
      <Submit>{submit}</Submit>
    </ActionForm>
  );
}

type Member = { user_id: string; profile: { display_name: string } | null };
export function leaderOptions(members: Member[], meetings: Pick<Tables<"meetings">, "discussion_leader_id" | "starts_at" | "status">[]): LeaderOption[] {
  return members.map((m) => ({
    id: m.user_id, name: nameOf(m.profile),
    lastLed: meetings.filter((x) => x.discussion_leader_id === m.user_id && x.status !== "cancelled").map((x) => x.starts_at).sort().at(-1) ?? null,
  })).sort((a, b) => (a.lastLed ?? "").localeCompare(b.lastLed ?? ""));
}
