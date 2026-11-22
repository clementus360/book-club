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
| `SUPABASE_SECRET_KEY` | yes, server only | The `sb_secret_…` key. `SUPABASE_SERVICE_ROLE_KEY` is also accepted. One call, `import_book()`, so only records this server fetched enter the shared catalogue. Also derives the key that signs search results |
| `SITE_URL` | in production | Invitation and email links. Falls back to the Vercel production domain |
| `GOOGLE_BOOKS_API_KEY` | no, server only | Without it, Google's shared anonymous quota applies and is often exhausted (HTTP 429). Open Library and manual entry carry on regardless |
| `OPEN_LIBRARY_CONTACT` | no | Contact address added to the User-Agent sent to Open Library, as they ask of regular users |
| `CONTACT_EMAIL` | no | Shown on the privacy and terms pages |

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

**Search.** Typing looks in the app's own books after 200 ms and the public catalogues after 650 ms, at least 1.2 s apart, with answers remembered in the tab, a day's cache on the server and 60 catalogue searches per person per five minutes.

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
