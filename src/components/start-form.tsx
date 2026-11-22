"use client";

import { useState, type ReactNode } from "react";
import { createCycle } from "@/lib/actions/cycles";
import { ActionForm, Submit } from "./forms/action-form";
import { Dialog, useCloseDialog } from "./forms/dialog";
import { Field } from "./forms/fields";

type Days = { nominate: number; vote: number; read: number };

function Form({ clubId, defaults, exact }: { clubId: string; defaults: Days; exact: ReactNode }) {
  const [simple, setSimple] = useState(true);
  const [days, setDays] = useState(defaults);
  const [opened] = useState(() => Date.now());
  const close = useCloseDialog();
  const on = (n: number) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(opened + (Number.isFinite(n) ? n : 0) * 864e5));
  const field = (key: keyof Days, label: string, max: number, hint: string) => (
    <Field label={label} name={`${key}_days`} type="number" inputMode="numeric" min={1} max={max} required className="mb-4" hint={hint}
      value={Number.isNaN(days[key]) ? "" : days[key]} onChange={(e) => setDays({ ...days, [key]: e.target.valueAsNumber })} />
  );
  return (
    <ActionForm action={createCycle} hidden={{ club_id: clubId, simple: simple ? "1" : null }} onDone={close}>
      <p className="mb-5">Everyone nominates one book, then you all vote, then you read the winner. How long should each step take?</p>
      {simple ? (
        <>
          {field("nominate", "Days to nominate", 90, `Until ${on(days.nominate)}`)}
          {field("vote", "Days to vote", 90, `Until ${on(days.nominate + days.vote)}`)}
          {field("read", "Days to read", 365, `Until ${on(days.nominate + days.vote + days.read)}`)}
          <p className="hint">You can move any of these later, or finish a step early.</p>
        </>
      ) : exact}
      <button type="button" className="btn-text mt-2" onClick={() => setSimple(!simple)}>{simple ? "Set exact dates instead" : "Use simple lengths instead"}</button>
      <div className="mt-5 flex flex-wrap gap-3">
        <Submit pending="Starting…">Start</Submit>
        <button type="button" className="btn btn-plain" onClick={close}>Cancel</button>
      </div>
    </ActionForm>
  );
}

export function StartChoosing(props: { clubId: string; defaults: Days; exact: ReactNode }) {
  return <Dialog trigger="Start choosing a book" triggerClass="btn btn-primary" title="Choose a book together"><Form {...props} /></Dialog>;
}
