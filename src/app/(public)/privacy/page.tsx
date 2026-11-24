import type { Metadata } from "next";
import { Legal } from "@/components/legal";
import { contactEmail, googleAuth } from "@/lib/env";
import { MINIMUM_AGE, OPERATOR } from "@/lib/legal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  const contact = contactEmail();
  return (
    <Legal title="Privacy" updated="24 November 2026">
      <p>{BRAND.name} is for small, private groups of readers. This page explains what it keeps, why, who can see it, and what you can do about it.</p>
      <h2>Who is responsible</h2>
      <p>{BRAND.name} is run by {OPERATOR.name}, in {OPERATOR.country}, who is the controller of your personal data. {contact ? <>You can write about anything on this page to <a className="link" href={`mailto:${contact}`}>{contact}</a>.</> : "Contact details are at the end of this page."}</p>
      <h2>Who can use it</h2>
      <p>You must be at least {MINIMUM_AGE} to have an account. If you believe someone younger has one, tell us and we will delete it.</p>
      <h2>What is kept</h2>
      <p>Your email address and a securely hashed password, used to sign you in. The name and, if you add one, the picture you choose to be known by. The books, reviews, notes, nominations, votes, progress, attendance and discussion you record.</p>
      {googleAuth() && <p>If you choose to sign in with Google, Google tells us your name, email address and the address of your Google picture. Your Google picture is only shown if you choose it in Your account. We ask for nothing else.</p>}
      <h2>What only you can see</h2>
      <p>My books: your notes, your personal ratings and your personal reviews. Your votes: other members, including administrators of your club, see totals after voting closes but never how you ranked the books. In a very small club, totals alone may still allow people to guess.</p>
      <h2>What your club can see</h2>
      <p>Your name and picture, what you recommend to that club and whatever you choose to share with the recommendation, what you nominate, your reading progress, which times suit you and whether you are coming to a meeting, and anything you write in the club’s discussion or club reviews. One club never sees what you do in another. If you leave, what you contributed stays in the club’s record under your name. You can withdraw your recommendations at any time.</p>
      <h2>Email</h2>
      <p>Unless you turn it off, {BRAND.name} emails you at important moments in your clubs: when it is time to nominate or vote, when a book is chosen, and when a meeting is arranged, moved or cancelled. These emails are sent through Resend, which therefore handles your email address and the email itself. They never include reviews, notes or how anyone voted. Every email has a link to stop them, and you can switch them off in Your account.</p>
      <h2>Your calendar</h2>
      <p>{BRAND.name} never reads your calendar. If you choose to see your meetings in one, it fetches them from a private link made for you, showing the name, time and place of each meeting and which club it is for. We keep only a scrambled form of the link, and you can turn it off at any time. Your calendar’s provider then holds those details too, as it does for anything else in it.</p>
      <h2>Books and covers</h2>
      <p>When you search for a book, the words you type are sent by our server to Open Library and Google Books. They do not receive your name or account. On a book page, our server also asks them, and the Internet Archive (which does Open Library’s lending), whether copies can be read, borrowed or bought, sending only the book’s identifiers and your country (worked out from your connection, not stored), so prices are for where you are. The links under “Get this book” go straight to those sites, with nothing added to say you came from {BRAND.name}. Cover images load in your browser from those services, so they see your IP address. A cover or club image someone added by hand is fetched by our server instead, so the site it is on does not see who is looking. A picture you upload is made small in your browser, then stored with Supabase at an unguessable address that is not listed anywhere; anyone who has that address can see the picture. A Google picture you choose loads from Google.</p>
      <h2>Films, series, anime and games</h2>
      <p>Clubs can also share films, TV series, anime or games. Searching for those sends the words you type, and only those, to The Movie Database (films), TVmaze (series), AniList (anime) or IGDB or RAWG (games). Their pages in {BRAND.name} also ask, for your country, where a film can be streamed (TMDB has this from JustWatch), where a series is shown, or which services list an anime. Posters and game covers load in your browser from those services. If you belong to a game club, you can say which platforms you play on; your game clubs see only how many members could not play a nominated game.</p>
      <p>Film details come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming information is from JustWatch. Series details are from TVmaze, under CC BY-SA. Anime details are from AniList. Game details are from IGDB or RAWG.</p>
      <h2>Cookies</h2>
      <p>Cookies keep you signed in and remember which club you were looking at. There is no advertising and no tracking.</p>
      <h2>Why it is used</h2>
      <p>To provide {BRAND.name} to you, as you asked when you made an account: signing you in, keeping your records and showing them to the people described above. This is the basis for nearly everything on this page.</p>
      <p>To keep it secure and working, which is in the legitimate interest of everyone who uses it: limits on how often things can be done, preventing abuse, and fixing faults. Emails at important moments are sent on the same basis, and you can turn them off at any time.</p>
      <p>A picture of yourself is entirely optional, and is only kept because you chose to add one.</p>
      <p>Nothing is used for advertising, sold or shared with anyone for their own purposes, and no decisions about you are made automatically.</p>
      <h2>Services used to run {BRAND.name}</h2>
      <p>Accounts and data are held by Supabase, the website is served by Vercel, and email is sent by Resend. They process data only on our behalf, to run the service. The operator can technically access stored data in order to operate it, and does so only when that is needed.</p>
      <h2>Where it is held</h2>
      <p>Data is stored in a Supabase database in {OPERATOR.storedIn}. Supabase, Vercel and Resend are based in the United States, and some processing, such as serving pages and sending email, may happen there or elsewhere. Each of them is bound by data processing terms, including the European Commission’s standard contractual clauses, to protect it to the standard required where you are and in {OPERATOR.country}.</p>
      <h2>How long it is kept</h2>
      <p>Your account and what you record are kept until you delete them or your account. When you delete your account, your personal records, votes, picture and email address are deleted at once. What you wrote for a club stays in that club’s record, without your name, because the other members share that history. Your vote totals from finished rounds stay, since they never showed how you voted.</p>
      <p>Records that an email was sent to you are kept while your account exists. Emails that could not be sent are given up after two days. Copies may remain for a short while in backups and in the services’ logs, which are overwritten on their own schedules, usually within weeks.</p>
      <h2>Your rights</h2>
      <p>Wherever you live, you can ask to see the personal data we hold about you, have it corrected, have it deleted, receive a copy in a form you can take elsewhere, or object to or limit how it is used. You can change your name, picture, email settings and records yourself, and delete your account from Your account at any time. For anything else, get in touch: we will answer within 30 days.</p>
      <p>{BRAND.name} is subject to {OPERATOR.country}’s {OPERATOR.law}. If you are unhappy with how your data is handled, you can complain to {OPERATOR.regulator}, or to the data protection authority where you live, though we would like the chance to put it right first.</p>
      <h2>Changes</h2>
      <p>If this page changes in a way that matters, we will say so in {BRAND.name} or by email before the change takes effect. The date at the top shows when it last changed.</p>
    </Legal>
  );
}
