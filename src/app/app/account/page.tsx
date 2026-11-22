import type { Metadata } from "next";
import { Fold } from "@/components/fold";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Field } from "@/components/forms/fields";
import { Avatar, PageHeader, Section } from "@/components/ui";
import { signOut, updatePassword } from "@/lib/actions/auth";
import { updateProfile } from "@/lib/actions/clubs";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Your account" };

export default async function Account() {
  const { profile, email } = await getViewer();
  return (
    <>
      <PageHeader kicker="Just for you" title="Your account" action={<form action={signOut}><button className="btn btn-plain">Sign out</button></form>}>
        This is about you, in every club. It changes nothing for anyone else.
      </PageHeader>
      <Section title={<span className="flex items-center gap-3"><Avatar person={profile} />{profile.display_name}</span>} note={email}>
        <Fold title="Name and picture" note="What members of your clubs see.">
          <ActionForm action={updateProfile} className="form">
            <Field label="Display name" name="display_name" required maxLength={80} defaultValue={profile.display_name} />
            <Field label="Picture address (optional)" name="avatar_url" type="url" maxLength={1000} defaultValue={profile.avatar_url ?? ""} hint="A link to an image, starting with https://" />
            <Submit>Save profile</Submit>
          </ActionForm>
        </Fold>
        <Fold title="Password" note="Choose one, or change it.">
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
