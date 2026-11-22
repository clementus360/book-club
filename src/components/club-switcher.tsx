"use client";

import { ArrowLeftRight, ChevronsUpDown, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { switchClub } from "@/lib/actions/clubs";
import { Icon } from "./icon";
import { useMenu } from "./use-menu";

type Club = { id: string; name: string };
const item = "flex min-h-11 items-center gap-2.5 w-full px-4 py-2.5 text-left hover:bg-leaf-wash/60";

/** Everything about which club, and about that club. */
export function ClubSwitcher({ clubs, current }: { clubs: Club[]; current: Club }) {
  const { ref, onKeyDown, close } = useMenu();
  const others = clubs.filter((c) => c.id !== current.id);
  return (
    <details ref={ref} className="group relative" onKeyDown={onKeyDown}>
      <summary data-hint="This club’s settings, and your other clubs." className="flex min-h-11 list-none items-center justify-between gap-2 border-y border-rule py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0"><span className="sr-only">Club menu: </span><span className="line-clamp-2 font-serif text-lg leading-tight break-words">{current.name}</span></span>
        <Icon of={ChevronsUpDown} className="text-soft" />
      </summary>
      <div className="absolute inset-x-0 top-full z-30 mt-1 border border-rule bg-sheet shadow-[0_8px_28px_rgb(33_31_27/0.16)]">
        <Link href="/app/settings" onClick={close} className={item}><Icon of={Settings} className="text-soft" />Club settings</Link>
        {others.length > 0 && (
          <form action={switchClub} className="border-t border-rule py-1">
            <p className="px-4 pt-2 text-sm text-soft">Switch to</p>
            {others.map((c) => <button key={c.id} name="club_id" value={c.id} data-hint={`Opens ${c.name}.`} className={item}><Icon of={ArrowLeftRight} className="text-soft" />{c.name}</button>)}
          </form>
        )}
        <Link href="/onboarding" onClick={close} className={`${item} border-t border-rule`}><Icon of={Plus} className="text-soft" />Start or join another club</Link>
      </div>
    </details>
  );
}
