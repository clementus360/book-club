import { AtSign, CalendarSync, Palette, Download, Gamepad2, KeyRound, Mail, Trash2, UserRound } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { Fold } from "@/components/fold";
import { ActionForm, Submit } from "@/components/forms/action-form";
import { Checkbox, Field } from "@/components/forms/fields";
import { PictureForm } from "@/components/picture-form";
import { Avatar, PageHeader, Section } from "@/components/ui";
import { changeEmail, deleteAccount, signOut, updatePassword } from "@/lib/actions/auth";
import { updateEmailUpdates, updatePlatforms, updateProfile } from "@/lib/actions/clubs";
import { isPlatform, PLATFORM_LABEL, PLATFORMS, words } from "@/lib/kinds";
import { currentTheme } from "@/lib/theme";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Your account" };

export default async function Account() {
  const { profile, email, supabase, club, clubs } = await getViewer();
  const theme = await currentTheme();
  const gamer = clubs.some((c) => c.kind === "game");
  // Offered only to people Google has given a picture for.
  const { data: auth } = await supabase.auth.getUser();
  const meta = auth.user?.user_metadata ?? {};
  const google = [meta.avatar_url, meta.picture].some((u) => typeof u === "string" && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(u));
  const hasPassword = ((auth.user?.app_metadata?.providers ?? []) as string[]).includes("email");
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
              hint={`When it is time to nominate or vote, when ${words(club?.kind).a} is chosen, and when a meeting is arranged, moved or cancelled. Everything else stays in Notifications.`} />
            <div className="mt-5"><Submit>Save email settings</Submit></div>
          </ActionForm>
        </Fold>
        {gamer && (
          <Fold icon={Gamepad2} title="What you play on" note={profile.platforms.length ? profile.platforms.filter(isPlatform).map((p) => PLATFORM_LABEL[p]).join(", ") : "Not said yet."}>
            <ActionForm action={updatePlatforms} className="form">
              <fieldset className="mb-5">
                <legend className="label">Your platforms</legend>
                <div className="grid grid-cols-2 gap-x-5">
                  {PLATFORMS.map((p) => <label key={p} className="choice"><input type="checkbox" name="platforms" value={p} defaultChecked={profile.platforms.includes(p)} />{PLATFORM_LABEL[p]}</label>)}
                </div>
                <p className="hint">Your game clubs see when a nominated game is not on anything members own.</p>
              </fieldset>
              <Submit>Save platforms</Submit>
            </ActionForm>
          </Fold>
        )}
        <Fold icon={Palette} title="Look" note={theme === "brand" ? "CommonPlace, the new look." : "Classic, the earlier look."}>
          <p className="mb-4">Try either look. It changes only this browser.</p>
          <div className="flex flex-wrap gap-3">
            {/* Plain links: the whole page must reload to take the new look. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={`btn ${theme === "brand" ? "btn-primary" : "btn-plain"}`} href="/theme/brand?back=/app/account" aria-current={theme === "brand" || undefined}><Labelled>New look</Labelled></a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className={`btn ${theme === "classic" ? "btn-primary" : "btn-plain"}`} href="/theme/classic?back=/app/account" aria-current={theme === "classic" || undefined}><Labelled>Classic look</Labelled></a>
          </div>
        </Fold>
        <Fold icon={CalendarSync} title="Calendar" note="See your meetings in your own calendar.">
          <Link className="btn btn-plain" href="/app/calendar"><Labelled>Add to my calendar</Labelled></Link>
        </Fold>
        <Fold icon={KeyRound} title="Password" note={hasPassword ? "Change it." : "Choose one, or change it."}>
          <ActionForm action={updatePassword} resetOnDone className="form">
            {hasPassword && <Field label="Current password" name="current_password" type="password" autoComplete="current-password" required />}
            <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
            <Field label="New password, again" name="password_again" type="password" autoComplete="new-password" required minLength={8} />
            <Submit>Change password</Submit>
          </ActionForm>
        </Fold>
        <Fold icon={AtSign} title="Email address" note={email}>
          <ActionForm action={changeEmail} resetOnDone className="form">
            <Field label="New email address" name="email" type="email" autoComplete="email" required maxLength={254} hint="We send a link to it. The change takes effect when you follow it." />
            {hasPassword && <Field label="Current password" name="current_password" type="password" autoComplete="current-password" required />}
            <Submit>Change email address</Submit>
          </ActionForm>
        </Fold>
        <Fold icon={Download} title="Your data" note="A copy of everything you have recorded.">
          <p className="mb-4">Your account, list, notes, ratings, reviews, votes, progress and what you have written in your clubs, in one file (JSON) you can keep or take elsewhere.</p>
          <a className="btn btn-plain" href="/app/account/export"><Labelled>Download my data</Labelled></a>
        </Fold>
        <Fold icon={Trash2} title="Delete your account" note="For good. This cannot be undone.">
          <ActionForm action={deleteAccount} className="form">
            <p className="mb-4">Your account, your list, your notes, ratings and private reviews, your votes and your picture are deleted. What you wrote for a club, such as discussion notes and club reviews, stays in its record without your name.</p>
            <p className="mb-4">{clubs.length ? "A club with nobody else in it is closed. If you are a club’s only administrator, the member who has been there longest takes over." : "You are not in any clubs."}</p>
            <Field label="To confirm, type your email address" name="confirm" type="email" autoComplete="off" required hint={email} />
            <Submit className="btn btn-danger" pending="Deleting…">Delete my account</Submit>
          </ActionForm>
        </Fold>
      </Section>
    </>
  );
}
