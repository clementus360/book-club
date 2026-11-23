"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { takeKept, trouble } from "@/lib/trouble";
import { Icon, Labelled } from "../icon";

export type FormAction = (state: ActionState | null, form: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action. Errors are announced where the form is, and
 * what the person typed is kept when something goes wrong.
 */
export function ActionForm({ action, children, className, onDone, resetOnDone = false, hidden }: {
  action: FormAction; children: ReactNode; className?: string; onDone?: () => void; resetOnDone?: boolean;
  hidden?: Record<string, string | null | undefined>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const snapshot = useRef<FormData | null>(null);
  const handled = useRef<number | undefined>(undefined);
  const [state, run] = useActionState(async (previous: ActionState | null, data: FormData) => {
    try {
      return await action(previous, data);
    } catch (error) {
      return trouble(error, form.current);
    }
  }, null);
  const [back, setBack] = useState(false);

  useEffect(() => {
    // The page was reloaded after an update: put back what was typed here.
    const el = form.current;
    const kept = el && takeKept(el);
    if (!el || !kept) return;
    refill(el, kept);
    for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    setBack(true);
  }, []);

  useEffect(() => {
    if (!state || handled.current === state.at) return;
    handled.current = state.at;
    setBack(false);
    const el = form.current;
    if (state.ok) {
      if (resetOnDone) el?.reset();
      onDone?.();
    } else if (el && snapshot.current) {
      // React resets uncontrolled fields after an action; put the words back.
      refill(el, snapshot.current);
    }
  }, [state, onDone, resetOnDone]);

  return (
    <form ref={form} action={run} onInvalidCapture={(e) => { for (let d = (e.target as Element).closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true; }} onSubmit={(e) => { snapshot.current = new FormData(e.currentTarget); }} className={className}>
      {Object.entries(hidden ?? {}).map(([k, v]) => v != null && <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div aria-live="polite">
        {back && <p className="notice mt-4"><Icon of={CircleAlert} className="mt-[0.2em]" /><span>Commonplace was updated while this page was open, so it was reloaded. What you entered is back. Please save again.</span></p>}
        {state?.message && <p className={`notice mt-4 ${state.ok ? "" : "error"}`}><Icon of={state.ok ? CircleCheck : CircleAlert} className="mt-[0.2em]" /><span>{state.message}</span></p>}
      </div>
    </form>
  );
}

/** Puts typed values back. Hidden fields and passwords are left alone. */
function refill(el: HTMLFormElement, data: FormData) {
  for (const field of Array.from(el.elements)) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name) continue;
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      field.checked = data.getAll(field.name).includes(field.value);
    } else if (field instanceof HTMLInputElement && (field.type === "hidden" || field.type === "password" || field.type === "file")) {
      continue;
    } else {
      const value = data.get(field.name);
      if (typeof value === "string") field.value = value;
    }
  }
}

export function Submit({ children, className = "btn btn-primary", pending: pendingLabel = "Saving…", ...rest }: {
  children: ReactNode; className?: string; pending?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-disabled={pending} {...rest} onClick={(e) => { if (pending) e.preventDefault(); }}>
      {pending ? pendingLabel : typeof children === "string" ? <Labelled>{children}</Labelled> : children}
    </button>
  );
}

/** One button, one action, no other fields. */
export function ActionButton({ action, hidden, children, className = "btn btn-plain", pending = "Working…" }: {
  action: FormAction; hidden?: Record<string, string | null | undefined>; children: ReactNode; className?: string; pending?: string;
}) {
  return (
    <ActionForm action={action} hidden={hidden} className="inline-block">
      <Submit className={className} pending={pending}>{children}</Submit>
    </ActionForm>
  );
}
