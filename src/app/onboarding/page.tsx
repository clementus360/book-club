import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field, TextArea } from "@/components/forms/fields";
import { Shell } from "@/components/shell";
import { BrowserTimezone } from "@/components/timezone-input";
import { Section, Side, WithMargin } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { createClub } from "@/lib/actions/clubs";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Start a club" };

export default async function Onboarding() {
  const { profile, clubs } = await getViewer();
  return (
    <Shell wide home={clubs.length ? "/app" : "/onboarding"} action={<form action={signOut}><button className="btn-text"><Labelled>Sign out</Labelled></button></form>}
      title={clubs.length ? "Start another club" : `Welcome, ${profile.display_name}`} lede="You will be shown what to do at every step.">
      <WithMargin margin={
        <>
          <Side title="Joining a friend’s club?"><p className="text-soft">Ask them for an invitation link and open it. That adds you to their club.</p></Side>
          <Side title="Just here to read?">
            <p className="mb-4 text-soft">You can keep your own list of books without a club.</p>
            <Link className="btn btn-plain" href={clubs.length ? "/app" : "/app/my-library"}>{clubs.length ? "Back to the club" : "Go to My books"}</Link>
          </Side>
        </>
      }>
        <Section title="Start a club" note="Give it a name, then invite your friends.">
          <ActionForm action={createClub} className="form">
            <BrowserTimezone />
            <Field label="Name of the club" name="name" required maxLength={80} placeholder="The Thursday Readers" />
            <TextArea label="Description (optional)" name="description" maxLength={2000} rows={3} hint="Who you are and what you like to read." />
            <Submit pending="Creating…">Create the club</Submit>
          </ActionForm>
        </Section>
      </WithMargin>
    </Shell>
  );
}
