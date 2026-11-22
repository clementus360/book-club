import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field, TimezoneSelect } from "@/components/forms/fields";
import { TimeInputs } from "@/components/time-inputs";
import { PageHeader } from "@/components/ui";
import { createPoll } from "@/lib/actions/polls";
import { getActiveCycle } from "@/lib/data/club";
import { requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Find a date" };

export default async function FindDate() {
  const { club, isAdmin } = await requireClub();
  if (!isAdmin) redirect("/app/meetings");
  const active = await getActiveCycle();
  return (
    <>
      <PageHeader kicker={club.name} title="Find a date">Suggest a few times. Everyone says which suit them, then you choose one and the meeting is arranged.</PageHeader>
      <ActionForm action={createPoll} hidden={{ club_id: club.id, cycle_id: active?.id }} className="form">
        <Field label="Title" name="title" required maxLength={160} placeholder="First discussion" />
        <TimeInputs />
        <TimezoneSelect defaultValue={club.timezone} hint="Where the meeting takes place." />
        <Field label="Location (optional)" name="location" maxLength={500} placeholder="Name and address" />
        <Submit>Ask everyone</Submit>
      </ActionForm>
    </>
  );
}
