"use client";

import { CalendarPlus, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { showCalendarLink, type LinkState } from "@/lib/actions/calendar";
import { Submit } from "./forms/action-form";
import { Icon, Labelled } from "./icon";
import { useMenu } from "./use-menu";
import { trouble } from "@/lib/trouble";

const item = "flex min-h-11 w-full items-center px-4 py-2.5 hover:bg-leaf-wash/60";
const OUT = { target: "_blank", rel: "noopener noreferrer" } as const;

/** One meeting, into the calendar someone already uses. Nothing to download. */
export function AddToCalendar({ google, outlook, work }: { google: string; outlook: string; work: string }) {
  const { ref, onKeyDown, close } = useMenu();
  return (
    <details ref={ref} className="relative" onKeyDown={onKeyDown}>
      <summary className="link cursor-pointer list-none [&::-webkit-details-marker]:hidden"><Icon of={CalendarPlus} />Add to calendar<Icon of={ChevronDown} /></summary>
      <div className="absolute top-full right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2.5rem)] border border-rule bg-sheet whitespace-normal shadow-[0_8px_28px_color-mix(in_srgb,var(--color-ink)_16%,transparent)]">
        <ul className="py-1">
          <li><a className={item} href={google} {...OUT} onClick={close}>Google Calendar</a></li>
          <li><a className={item} href={outlook} {...OUT} onClick={close}>Outlook.com</a></li>
          <li><a className={item} href={work} {...OUT} onClick={close}>Outlook for work or school</a></li>
          <li className="border-t border-rule"><Link className={`${item} !block`} href="/app/calendar" onClick={close}>Apple and other calendars<span className="meta block">Every meeting, kept up to date</span></Link></li>
        </ul>
      </div>
    </details>
  );
}

/** For calendars with no button of their own. */
export function PrivateLink({ on }: { on: boolean }) {
  const [state, run] = useActionState<LinkState | null>(async () => {
    try { return await showCalendarLink(); } catch (error) { return trouble(error); }
  }, null);
  const [copied, setCopied] = useState(false);
  const [was, setWas] = useState(on);
  const [dead, setDead] = useState<string>(); // turned off since it was shown
  if (was !== on) { setWas(on); if (!on) setDead(state?.link); setCopied(false); }
  const link = state?.link !== dead ? state?.link : undefined;
  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      const input = document.getElementById("calendar-link");
      if (input instanceof HTMLInputElement) input.select();
    }
  }
  return (
    <form action={run} className="form">
      <div aria-live="polite">
        {link && (
          <>
            <label htmlFor="calendar-link" className="label">Your private link</label>
            <div className="flex gap-2">
              <input id="calendar-link" readOnly value={link} className="input" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-primary" onClick={() => void copy(link)}><Labelled>{copied ? "Copied" : "Copy"}</Labelled></button>
            </div>
            <p className="hint">In your calendar app, look for “Subscribe” or “Add by URL” and paste this. Anyone with the link can see your meetings, so keep it to yourself.</p>
          </>
        )}
        {state && !state.ok && <p className="notice error mb-4">{state.message}</p>}
      </div>
      {!link && <Submit className="btn btn-plain" pending="One moment…">Show my private link</Submit>}
    </form>
  );
}
