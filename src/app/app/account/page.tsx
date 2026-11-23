import { CalendarSync, KeyRound, Mail, UserRound } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { Fold } from "@/components/fold";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Checkbox, Field } from "@/components/forms/fields";
import { PictureForm } from "@/components/picture-form";
import { Avatar, PageHeader, Section } from "@/components/ui";
import { signOut, updatePassword } from "@/lib/actions/auth";
import { updateEmailUpdates, updateProfile } from "@/lib/actions/clubs";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Your account" };

export default async function Account() {
  const { profile, email, supabase } = await getViewer();
  // Offered only to people Google has given a picture for.
  const { data: auth } = await supabase.auth.getUser();
  const meta = auth.user?.user_metadata ?? {};
  const google = [meta.avatar_url, meta.picture].some((u) => typeof u === "string" && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(u));
  return (
    <>
      <PageHeader icon={UserRound} kicker="Just for you" title="Your account" action={<form action={signOut}><button className="btn btn-plain"><Labelled>Sign out</Labelled></button></form>}>
        This is about you, in every club. It changes nothing for anyone else.
      </PageHeader>
      <Section title={<span className="flex items-center gap-3"><Avatar person={profile} />{profile.display_name}</span>} note={email}>
        <Fold icon={UserRound} title="Name and picture" note="What members of your clubs see.">
          <div className="form">
            <PictureForm person={profile} google={google} />
            <ActionForm action={updateProfile}>
              <Field label="Display name" name="display_name" required maxLength={80} defaultValue={profile.display_name} />
              <Submit>Save name</Submit>
            </ActionForm>
          </div>
        </Fold>
        <Fold icon={Mail} title="Email" note={profile.email_updates ? "On for important moments." : "Off."}>
          <ActionForm action={updateEmailUpdates} className="form">
            <Checkbox name="email_updates" defaultChecked={profile.email_updates} label="Email me at important moments"
              hint="When it is time to nominate or vote, when a book is chosen, and when a meeting is arranged, moved or cancelled. Everything else stays in Notifications." />
            <div className="mt-5"><Submit>Save email settings</Submit></div>
          </ActionForm>
        </Fold>
        <Fold icon={CalendarSync} title="Calendar" note="See your meetings in your own calendar.">
          <Link className="btn btn-plain" href="/app/calendar"><Labelled>Add to my calendar</Labelled></Link>
        </Fold>
        <Fold icon={KeyRound} title="Password" note="Choose one, or change it.">
          <ActionForm action={updatePassword} resetOnDone className="form">
            <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
            <Field label="New password, again" name="password_again" type="password" autoComplete="new-password" required minLength={8} />
            <Submit>Change password</Submit>
          </ActionForm>
        </Fold>
      </Section>
    </>
  );
}
