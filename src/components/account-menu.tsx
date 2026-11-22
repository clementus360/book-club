"use client";

import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { Avatar } from "./ui";
import { useMenu } from "./use-menu";

const item = "block min-h-11 w-full px-4 py-2.5 text-left hover:bg-leaf-wash/60";

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
        {up && <span aria-hidden className="text-soft">⋯</span>}
      </summary>
      <div className={`absolute z-40 border border-rule bg-sheet shadow-[0_8px_28px_rgb(33_31_27/0.16)] ${up ? "inset-x-0 bottom-full mb-2" : "top-full right-0 mt-2 w-64 max-w-[calc(100vw-2.5rem)]"}`}>
        <p className="border-b border-rule px-4 py-3"><span className="block truncate font-serif">{person.display_name}</span><span className="meta block truncate">{email}</span></p>
        <ul className="py-1">
          <li><Link className={item} href="/app/account" onClick={close}>Your account</Link></li>
          <li><Link className={item} href="/app/help" onClick={close}>Help and guide</Link></li>
          <li className="border-t border-rule"><form action={signOut}><button className={item}>Sign out</button></form></li>
        </ul>
      </div>
    </details>
  );
}
