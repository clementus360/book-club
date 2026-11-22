import { Bell } from "lucide-react";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { ClubSwitcher } from "@/components/club-switcher";
import { HelpButton } from "@/components/help-button";
import { HintLayer } from "@/components/hint-layer";
import { Icon } from "@/components/icon";
import { BottomBar, CLUB_LINKS, OWN_LINKS, SideLinks } from "@/components/nav";
import { Wordmark } from "@/components/wordmark";
import { getViewer } from "@/lib/viewer";

export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, email, clubs, club, unread } = await getViewer();
  const list = clubs.map(({ id, name }) => ({ id, name }));

  const person = { display_name: profile.display_name, avatar_url: profile.avatar_url };
  const menu = (
    <div className="flex flex-col gap-7">
      {club ? (
        <div>
          <ClubSwitcher clubs={list} current={{ id: club.id, name: club.name }} />
          <div className="mt-3"><SideLinks label="Club" links={CLUB_LINKS} /></div>
        </div>
      ) : (
        <Link href="/onboarding" className="btn btn-primary self-start">Start or join a club</Link>
      )}
      <div>
        <p className="rubric mb-1">Just for you</p>
        <SideLinks label="Just for you" links={OWN_LINKS} />
      </div>
      <div className="border-t border-rule pt-4">
        <Link href="/app/notifications" className="flex items-center gap-2.5 py-2.5 text-[0.9688rem] text-soft hover:text-ink lg:py-1.5">
          <Icon of={Bell} />Notifications{unread > 0 && <span className="rounded-full bg-rubric px-2 py-0.5 text-xs font-medium text-sheet">{unread}<span className="sr-only"> unread</span></span>}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[82rem] min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 bg-sheet p-3 focus:not-sr-only focus:absolute focus:top-2 focus:left-2">Skip to content</a>
      <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-2.5 lg:hidden">
        <Wordmark href="/app" />
        <div className="flex items-center gap-5">
          <HelpButton className="btn-text text-sm" />
          <AccountMenu person={person} email={email} placement="down" />
        </div>
      </header>
      <div className="hidden lg:block">
        {/* The middle scrolls if it must; the account stays put at the foot. */}
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-9 pb-4">
            <Wordmark href="/app" className="mb-7 block text-[1.6rem]" />
            {menu}
          </div>
          <div className="shrink-0 border-t border-rule px-8 py-2.5"><AccountMenu person={person} email={email} placement="up" /></div>
        </div>
      </div>
      <main id="main" tabIndex={-1} className="relative min-w-0 px-5 pt-8 pb-28 outline-none sm:px-8 lg:border-l lg:border-rule lg:px-14 lg:pt-12 lg:pb-20">
        <div className="max-w-[56rem]">
          <div className="-mt-4 mb-3 hidden justify-end lg:flex"><HelpButton className="btn-text text-sm" /></div>
          {children}
        </div>
      </main>
      <HintLayer />
      <BottomBar hasClub={Boolean(club)} unread={unread}>{menu}</BottomBar>
    </div>
  );
}
