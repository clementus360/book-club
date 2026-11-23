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
import { describeKind, KINDS, type Kind } from "@/lib/kinds";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Start a club" };

const ABOUT: Record<Kind, string> = {
  book: "Read a book together, then meet.",
  film: "Watch a film, then talk about it.",
  series: "Watch a series, a season at a time.",
  anime: "Watch an anime series together.",
  game: "Play a game, then compare notes.",
};

export default async function Onboarding() {
  const { profile, clubs } = await getViewer();
  return (
    <Shell wide home={clubs.length ? "/app" : "/onboarding"} action={<form action={signOut}><button className="btn-text"><Labelled>Sign out</Labelled></button></form>}
      title={clubs.length ? "Start another club" : `Welcome, ${profile.display_name}`} lede="You will be shown what to do at every step.">
      <WithMargin margin={
        <>
          <Side title="Joining a friend’s club?"><p className="text-soft">Ask them for an invitation link and open it. That adds you to their club.</p></Side>
          <Side title="Just here for yourself?">
            <p className="mb-4 text-soft">You can keep your own list of books, films or games without a club.</p>
            <Link className="btn btn-plain" href={clubs.length ? "/app" : "/app/my-library"}>{clubs.length ? "Back to the club" : "Go to My books"}</Link>
          </Side>
        </>
      }>
        <Section title="Start a club" note="Give it a name, then invite your friends.">
          <ActionForm action={createClub} className="form">
            <BrowserTimezone />
            <fieldset className="mb-5">
              <legend className="label">What will the club share?</legend>
              <div className="grid gap-x-5 sm:grid-cols-2">
                {KINDS.map((k, i) => (
                  <label key={k} className="choice"><input type="radio" name="kind" value={k} defaultChecked={i === 0} required />
                    <span>{describeKind(k)}<span className="block text-sm text-soft">{ABOUT[k]}</span></span>
                  </label>
                ))}
              </div>
              <p className="hint">This sets the words used everywhere, and what can be searched for. It cannot change once the club has started.</p>
            </fieldset>
            <Field label="Name of the club" name="name" required maxLength={80} placeholder="The Thursday Club" />
            <TextArea label="Description (optional)" name="description" maxLength={2000} rows={3} hint="Who you are and what you enjoy." />
            <Submit pending="Creating…">Create the club</Submit>
          </ActionForm>
        </Section>
      </WithMargin>
    </Shell>
  );
}
