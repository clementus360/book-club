"use client";

import { ChevronsUpDown, CircleQuestionMark, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { Icon } from "./icon";
import { Avatar } from "./ui";
import { useMenu } from "./use-menu";

const item = "flex min-h-11 items-center gap-2.5 w-full px-4 py-2.5 text-left hover:bg-leaf-wash/60";

/**
 * Only what belongs to the person, never to a club. Opens over the page, so
 * nothing moves: upwards from the foot of the side menu, downwards on a phone.
 */
export function AccountMenu({ person, email, placement }: { person: { display_name: string; avatar_url: string | null }; email: string; placement: "up" | "down" }) {
  const { ref, onKeyDown, close } = useMenu();
  const up = placement === "up";
  return (
    <details ref={ref} className="group relative" onKeyDown={onKeyDown}>
      <summary data-hint="Your account, the guide, and signing out." className="flex min-h-11 list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
        <Avatar person={person} className={up ? "size-8 text-sm" : "size-9 text-sm"} />
        <span className={up ? "min-w-0 flex-1 truncate" : "sr-only"}><span className="sr-only">Your menu: </span>{person.display_name}</span>
        {up && <Icon of={ChevronsUpDown} className="text-soft" />}
      </summary>
      <div className={`absolute z-40 border border-rule bg-sheet shadow-[0_8px_28px_color-mix(in_srgb,var(--color-ink)_16%,transparent)] ${up ? "inset-x-0 bottom-full mb-2" : "top-full right-0 mt-2 w-64 max-w-[calc(100vw-2.5rem)]"}`}>
        <p className="border-b border-rule px-4 py-3"><span className="block truncate font-serif">{person.display_name}</span><span className="meta block truncate">{email}</span></p>
        <ul className="py-1">
          <li><Link className={item} href="/app/account" onClick={close}><Icon of={UserRound} className="text-soft" />Your account</Link></li>
          <li><Link className={item} href="/app/help" onClick={close}><Icon of={CircleQuestionMark} className="text-soft" />Help and guide</Link></li>
          <li className="border-t border-rule"><form action={signOut}><button className={item}><Icon of={LogOut} className="text-soft" />Sign out</button></form></li>
        </ul>
      </div>
    </details>
  );
}
