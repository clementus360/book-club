"use client";

import { useState } from "react";
import { saveProgress } from "@/lib/actions/cycles";
import { words, type Kind } from "@/lib/kinds";
import { ActionForm, Submit } from "./forms/action-form";
import { Field } from "./forms/fields";

type Mine = { status: "not_started" | "reading" | "finished"; current_page: number | null; percentage: number | null; episode: number | null; hours: number | null } | null;

/** Where you are, counted in whatever suits the kind: pages, episodes or hours. Films are just started or finished. */
export function ProgressForm({ cycleId, mine, kind = "book", episodes = null }: { cycleId: string; mine: Mine; kind?: Kind; episodes?: number | null }) {
  const [status, setStatus] = useState(mine?.status ?? "not_started");
  const w = words(kind);
  return (
    <ActionForm action={saveProgress} hidden={{ cycle_id: cycleId }}>
      <fieldset className="mb-3">
        <legend className="label">Where are you?</legend>
        {([["not_started", "Not started"], ["reading", w.progressing], ["finished", "Finished"]] as const).map(([v, l]) => (
          <label key={v} className="choice"><input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} />{l}</label>
        ))}
      </fieldset>
      {status === "reading" && w.unit === "page" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Page (optional)" name="current_page" inputMode="numeric" defaultValue={mine?.current_page ?? ""} className="mb-4" />
          <Field label="Percent (optional)" name="percentage" inputMode="numeric" defaultValue={mine?.percentage ?? ""} className="mb-4" />
        </div>
      )}
      {status === "reading" && w.unit === "episode" && (
        <Field label={episodes ? `Episode, of ${episodes} (optional)` : "Episode (optional)"} name="episode" inputMode="numeric" defaultValue={mine?.episode ?? ""} className="mb-4" />
      )}
      {status === "reading" && w.unit === "hours" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hours played (optional)" name="hours" inputMode="numeric" defaultValue={mine?.hours ?? ""} className="mb-4" />
          <Field label="Percent (optional)" name="percentage" inputMode="numeric" defaultValue={mine?.percentage ?? ""} className="mb-4" />
        </div>
      )}
      <Submit className="btn btn-plain">Update my progress</Submit>
    </ActionForm>
  );
}
