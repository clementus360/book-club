# Commonplace

Good books. Better conversations.

A private place for a book club to choose books together, read together, meet, and keep a record of it, with a personal library for each member that stays their own.

Next.js 16 (App Router), React 19, strict TypeScript, Tailwind 4, Supabase (Postgres, Auth, Row Level Security).

## Run it

You need Node 20.9+ and a Supabase project (a free hosted one is fine).

```sh
npm install
cp .env.example .env.local      # fill in the Supabase values
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --remote   # applies supabase/migrations; no Docker needed
npm run dev
```

With Docker you can use a local Supabase instead: `npx supabase start`, then copy the URL and keys it prints into `.env.local`.

### Environment variables

| Variable | Needed | What it is for |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key |
| `SUPABASE_SECRET_KEY` | yes, server only | The `sb_secret_…` key. `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Used for `import_book()`, so only records this server fetched enter the shared catalogue, and to hand out email. Also derives the key that signs search results |
| `SITE_URL` | in production | Invitation and email links. Falls back to the Vercel production domain |
| `GOOGLE_BOOKS_API_KEY` | no, server only | Without it, Google's shared anonymous quota applies and is often exhausted (HTTP 429). Open Library and manual entry carry on regardless |
| `TMDB_API_KEY` | no, server only | Film search and where-to-watch. Without it, film clubs can still add films by hand |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | no, server only | Game search through IGDB (a free Twitch developer app). Preferred over RAWG when set |
| `RAWG_API_KEY` | no, server only | Game search through RAWG, used when the Twitch pair is not set |
| `OPEN_LIBRARY_CONTACT` | no | Contact address added to the User-Agent sent to Open Library, as they ask of regular users |
| `CONTACT_EMAIL` | no | Shown on the privacy and terms pages |
| `RESEND_API_KEY` | for email, server only | Resend API key with sending access. Without it and `EMAIL_FROM`, nothing is emailed |
| `EMAIL_FROM` | for email | Sender, on a domain verified in Resend, e.g. `Commonplace <club@mail.example.com>` |

All of these are read on the server only, so none needs a `NEXT_PUBLIC_` prefix. The prefixed names (`NEXT_PUBLIC_SUPABASE_URL` and so on) still work, except that the secret and API keys must never have one.

### Supabase Auth settings

1. **URL configuration**: set the Site URL to your domain and add `https://your-domain/**` to the redirect URLs.
2. **Email templates** (recommended): the default links only work in the browser that asked for them. These work anywhere:
   - Confirm signup: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   - Reset password: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
3. **SMTP**: configure your own sender. Supabase's built-in one is limited to a few messages an hour.
4. **Password length**: 8 or more, to match the app.

### Sign in with Google (optional)

1. In Google Cloud, set up the consent screen, then create an OAuth client of type **Web application**. Its redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase, under **Authentication > Sign In / Providers > Google**, paste the client ID and secret and enable it.
3. Run `npx supabase db push --remote`, set `GOOGLE_AUTH=1` and rebuild.

## Deploy to Vercel

Import the repository, set the variables above for Production (and Preview if you use it), and deploy. No cron jobs are needed. Run `npx supabase db push --remote` whenever migrations change.

## How it is put together

```
src/app/(public)        homepage, privacy, terms
src/app/(auth)          sign in, sign up, password reset
src/app/app             the private application
src/app/invite/[token]  invitations
src/lib/actions         server actions: every mutation
src/lib/data            club queries
src/lib/books           Open Library and Google Books, normalised and merged
src/lib/viewer.ts       who is signed in, which club is selected
src/proxy.ts            session refresh and route protection
supabase/migrations     schema, rules, RLS, grants
```

**Rules live in the database.** Anything spanning rows (invitations, roles, cycles, nominations, ballots, recommendations) is a `SECURITY DEFINER` function that checks membership itself. Simple own-row writes are governed by RLS and column-level grants. Server actions run as the signed-in person, never as the service role. The last migration revokes everything and grants back only what is expected, so nothing relies on default privileges. A later migration that adds a function must revoke `EXECUTE` from `public`.

**Deadlines need no scheduler.** `sync_cycle()` does whatever the clock says is due. Pages and mutations call it first, under a row lock, so a late ballot is refused even if nobody has visited since the deadline.

**Voting.** Full ranked ballots, Borda count. A tie opens a runoff between the tied books. If that ties too, or nobody votes, an administrator chooses among the books still level and must record how. Results are written only when a round closes. Ballots are readable only by their owner, administrators included. In very small clubs, totals alone can let people guess.

**Spacing.** One set of numbers, described in `src/app/globals.css` and used only through `PageHeader`, `BookHeader`, `Section`, `Side`, `Toolbar`, `Fold` and the `.row` classes. `tests/e2e/spacing.spec.ts` measures every page in the app against it.

**Guidance.** `src/lib/guide.ts` decides the one thing to suggest to each person, `src/lib/hints.ts` says what every control does, and `src/lib/help.ts` holds the help for each page. A new button needs an entry in `hints.ts`; `tests/e2e/help.spec.ts` fails without one. The interface never says "cycle", "ballot" or "runoff": `src/lib/plain.ts` rewords the few database messages that do.

**Email.** Milestones only (time to nominate or vote, a book chosen, a meeting arranged, moved or cancelled, a date to find), through Resend. A trigger queues one row per email in `private.email_outbox`. Each minute `pg_cron` runs `private.tick()`, which also moves every club past its deadlines, and if anything is owed it calls `POST /api/email/send` through `pg_net` with a secret that never leaves the database. That route hands out emails with `claim_emails()` (service role only), sends each with an idempotency key, and records the result: up to five tries, nothing older than two days. Unsubscribe links are signed, ask before acting, and support one-click unsubscribe. Without `RESEND_API_KEY` and `EMAIL_FROM` nothing is sent. Where `pg_cron` is missing (plain Postgres, as in the tests), deadlines are still kept as pages load.

**Pictures.** The browser crops a chosen photo to a 256-pixel square and encodes it as WebP (JPEG where it cannot), typically 10 to 30 KB, so no paid image processing is needed. A server action checks the bytes and uploads, as the signed-in person, to the public `avatars` bucket under `<user id>/<random>.webp`. Storage policies keep everyone inside their own folder, three files at most, and the previous file is deleted on replacement. Google's picture is used only if the person chooses it. The bucket and policies are created by a migration when Supabase Storage is present.

**Calendars.** Nothing to set up. A meeting opens in Google or Outlook through a prefilled link. "Add to my calendar" subscribes to `/calendar/<token>.ics`, read without a session by `calendar_feed()`, the second of the two functions a signed-out caller may use. The token is derived from `SUPABASE_SECRET_KEY` and a nonce, and only its hash is stored, so replacing that key ends existing subscriptions once their owner next makes a link. Commonplace never reads anyone's calendar: dates are found by asking (`meeting_polls`).

**Kinds of club.** A club is for books, films, TV series, anime or games, chosen when it is created and fixed once anything is added (`clubs.kind`, enforced by a trigger). The catalogue table keeps its name, `books`, and each row has a `kind`; triggers on `club_books`, `nominations` and `club_recommendations` refuse anything of another kind, so every way in is covered. Everything people read comes from `src/lib/kinds.ts` (`words(kind)`), written as whole sentences with slots for articles and verbs, so book clubs read exactly as before. Hints, help, the guide, emails and database messages (`plain(message, kind)`) all take the kind. Sources: films from TMDB, series from TVmaze, anime from AniList, games from IGDB or RAWG (`src/lib/media/`), each credited on the item's page. Progress is counted in pages, episodes or hours; game clubs see how many members have nothing to play a nomination on, from the platforms people choose in Your account.

**Get this book.** Each book page lists where to read it free or borrow it (Open Library), buy the e-book (Google Play, priced for the reader's country from Vercel's `x-vercel-ip-country`), and search links for WorldCat, Amazon and AbeBooks. Lookups use stored identifiers or the ISBN, are cached for a day, stream in after the page and are skipped quietly when a service is down.

**Saving after a deploy.** A page opened before a deployment holds old Server Action IDs. Forms catch that error, keep what was typed, reload once and put it back; connection failures are explained in the form rather than on the error page (`src/lib/trouble.ts`).

**Search.** Typing looks in the app's own books after 200 ms and the public catalogues after 400 ms, at least 0.7 s apart, showing each catalogue’s results as they arrive (Open Library is given up on 4 s after the start once Google has answered), with answers remembered in the tab, a day's cache on the server and 60 catalogue searches per person per five minutes.

**Books.** One row is one publication. The same provider id, or the same ISBN with compatible volumes, reuses a row. Anything less certain is put to the reader. Manual entries are visible only to the person who made them until they reach a club.

After changing a migration, run `npm run db:types` to regenerate `src/lib/database.types.ts`.

## Tests

```sh
npm run test:unit          # metadata, dates, safety helpers
npm run test:integration   # schema, RLS and workflows, as the real database roles
npx playwright install chromium
npm run test:e2e           # browser journeys, accessibility, phone layout
npm run typecheck && npm run lint && npm run build
```

Integration tests start a throwaway Postgres on a free port. They find Postgres.app, Homebrew or Debian binaries, or use `PG_BIN`, or a server given by `TEST_DATABASE_URL`.

End-to-end tests run a production build against that Postgres through `tests/support/supabase-emulator.mjs`, a test-only stand-in for Supabase's HTTP layer, so they need no Docker. RLS, grants and functions are the real ones; the Auth server and PostgREST are not. To run against a real project with email confirmation off, start the app yourself and set `E2E_BASE_URL`.
