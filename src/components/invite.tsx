"use client";

import { useActionState, useState } from "react";
import { createInvitation, type InviteState } from "@/lib/actions/clubs";
import { Dialog } from "./forms/dialog";
import { Submit } from "./forms/action-form";

export function InviteDialog({ clubId, clubName, triggerClass = "btn btn-primary" }: { clubId: string; clubName: string; triggerClass?: string }) {
  return <Dialog trigger="Invite someone" triggerClass={triggerClass} title={`Invite someone to ${clubName}`}><InviteForm clubId={clubId} /></Dialog>;
}

function InviteForm({ clubId }: { clubId: string }) {
  const [state, run] = useActionState<InviteState | null, FormData>(createInvitation, null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      const input = document.getElementById("invite-link");
      if (input instanceof HTMLInputElement) input.select();
    }
  }

  return (
    <form action={run}>
      <input type="hidden" name="club_id" value={clubId} />
      <p className="text-soft">Each link admits one person and lasts seven days. Send it to them however you like. They join straight away.</p>
      <div aria-live="polite">
        {state?.link && (
          <div className="mt-5">
            <label htmlFor="invite-link" className="label">Invitation link</label>
            <div className="flex gap-2">
              <input id="invite-link" readOnly value={state.link} className="input" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-primary" onClick={() => void copy(state.link!)}>{copied === state.link ? "Copied" : "Copy"}</button>
            </div>
            <p className="hint">Copy it now. For safety it is not stored, so it cannot be shown again.</p>
          </div>
        )}
        {state && !state.ok && <p className="notice error mt-4">{state.message}</p>}
      </div>
      <div className="mt-6"><Submit className={`btn ${state?.link ? "btn-plain" : "btn-primary"}`} pending="Making a link…">{state?.link ? "Make another link" : "Make an invitation link"}</Submit></div>
    </form>
  );
}
