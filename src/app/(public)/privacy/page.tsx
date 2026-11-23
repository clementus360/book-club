import type { Metadata } from "next";
import { Legal } from "@/components/legal";
import { googleAuth } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="23 November 2026">
      <p>Commonplace is for small, private groups of readers. This page explains what it keeps and who can see it.</p>
      <h2>What is kept</h2>
      <p>Your email address and a securely hashed password, used to sign you in. The name and, if you add one, the picture you choose to be known by. The books, reviews, notes, nominations, votes, progress, attendance and discussion you record.</p>
      {googleAuth() && <p>If you choose to sign in with Google, Google tells us your name, email address and the address of your Google picture. Your Google picture is only shown if you choose it in Your account. We ask for nothing else.</p>}
      <h2>What only you can see</h2>
      <p>My books: your notes, your personal ratings and your personal reviews. Your votes: other members, including administrators of your club, see totals after voting closes but never how you ranked the books. In a very small club, totals alone may still allow people to guess.</p>
      <h2>What your club can see</h2>
      <p>Your name and picture, what you recommend to that club and whatever you choose to share with the recommendation, what you nominate, your reading progress, which times suit you and whether you are coming to a meeting, and anything you write in the club’s discussion or club reviews. One club never sees what you do in another. If you leave, what you contributed stays in the club’s record under your name. You can withdraw your recommendations at any time.</p>
      <h2>Email</h2>
      <p>Unless you turn it off, Commonplace emails you at important moments in your clubs: when it is time to nominate or vote, when a book is chosen, and when a meeting is arranged, moved or cancelled. These emails are sent through Resend, which therefore handles your email address and the email itself. They never include reviews, notes or how anyone voted. Every email has a link to stop them, and you can switch them off in Your account.</p>
      <h2>Your calendar</h2>
      <p>Commonplace never reads your calendar. If you choose to see your meetings in one, it fetches them from a private link made for you, showing the name, time and place of each meeting and which club it is for. We keep only a scrambled form of the link, and you can turn it off at any time. Your calendar’s provider then holds those details too, as it does for anything else in it.</p>
      <h2>Books and covers</h2>
      <p>When you search for a book, the words you type are sent by our server to Open Library and Google Books. They do not receive your name or account. On a book page, our server also asks them whether copies can be read, borrowed or bought, sending only the book’s identifiers and your country (worked out from your connection, not stored), so prices are for where you are. The links under “Get this book” go straight to those sites, with nothing added to say you came from Commonplace. Cover images load in your browser from those services, and manually added covers from wherever they are hosted, so those hosts see your IP address. A picture you upload is made small in your browser, then stored with Supabase at an unguessable address that is not listed anywhere; anyone who has that address can see the picture. A Google picture you choose loads from Google.</p>
      <h2>Films, series, anime and games</h2>
      <p>Clubs can also share films, TV series, anime or games. Searching for those sends the words you type, and only those, to The Movie Database (films), TVmaze (series), AniList (anime) or IGDB or RAWG (games). Their pages in Commonplace also ask, for your country, where a film can be streamed (TMDB has this from JustWatch), where a series is shown, or which services list an anime. Posters and game covers load in your browser from those services. If you belong to a game club, you can say which platforms you play on; your game clubs see only how many members could not play a nominated game.</p>
      <p>Film details come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming information is from JustWatch. Series details are from TVmaze, under CC BY-SA. Anime details are from AniList. Game details are from IGDB or RAWG.</p>
      <h2>Cookies</h2>
      <p>Cookies keep you signed in and remember which club you were looking at. There is no advertising and no tracking.</p>
      <h2>Services used to run Commonplace</h2>
      <p>Accounts and data are held by Supabase, the website is served by Vercel, and email is sent by Resend. Administrators of this installation can technically access stored data in order to operate it.</p>
      <h2>Your choices</h2>
      <p>You can edit or delete your library entries, reviews and notes yourself. To have your account deleted or to receive a copy of your data, get in touch.</p>
    </Legal>
  );
}
