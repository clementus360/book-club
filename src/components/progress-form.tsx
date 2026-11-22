"use client";

import { useState } from "react";
import { saveProgress } from "@/lib/actions/cycles";
import { ActionForm, Submit } from "./forms/action-form";
import { Field } from "./forms/fields";

type Mine = { status: "not_started" | "reading" | "finished"; current_page: number | null; percentage: number | null } | null;

export function ProgressForm({ cycleId, mine }: { cycleId: string; mine: Mine }) {
  const [status, setStatus] = useState(mine?.status ?? "not_started");
  return (
    <ActionForm action={saveProgress} hidden={{ cycle_id: cycleId }}>
      <fieldset className="mb-3">
        <legend className="label">Where are you?</legend>
        {([["not_started", "Not started"], ["reading", "Reading"], ["finished", "Finished"]] as const).map(([v, l]) => (
          <label key={v} className="choice"><input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} />{l}</label>
        ))}
      </fieldset>
      {status === "reading" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Page (optional)" name="current_page" inputMode="numeric" defaultValue={mine?.current_page ?? ""} className="mb-4" />
          <Field label="Percent (optional)" name="percentage" inputMode="numeric" defaultValue={mine?.percentage ?? ""} className="mb-4" />
        </div>
      )}
      <Submit className="btn btn-plain">Update my progress</Submit>
    </ActionForm>
  );
}
