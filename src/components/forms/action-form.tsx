"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

export type FormAction = (state: ActionState | null, form: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action. Errors are announced where the form is, and
 * what the person typed is kept when something goes wrong.
 */
export function ActionForm({ action, children, className, onDone, resetOnDone = false, hidden }: {
  action: FormAction; children: ReactNode; className?: string; onDone?: () => void; resetOnDone?: boolean;
  hidden?: Record<string, string | null | undefined>;
}) {
  const [state, run] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const snapshot = useRef<FormData | null>(null);
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state || handled.current === state.at) return;
    handled.current = state.at;
    const el = form.current;
    if (state.ok) {
      if (resetOnDone) el?.reset();
      onDone?.();
    } else if (el && snapshot.current) {
      // React resets uncontrolled fields after an action; put the words back.
      for (const field of Array.from(el.elements)) {
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name) continue;
        if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
          field.checked = snapshot.current.getAll(field.name).includes(field.value);
        } else if (field instanceof HTMLInputElement && (field.type === "hidden" || field.type === "password")) {
          continue;
        } else {
          const value = snapshot.current.get(field.name);
          if (typeof value === "string") field.value = value;
        }
      }
    }
  }, [state, onDone, resetOnDone]);

  return (
    <form ref={form} action={run} onInvalidCapture={(e) => { for (let d = (e.target as Element).closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true; }} onSubmit={(e) => { snapshot.current = new FormData(e.currentTarget); }} className={className}>
      {Object.entries(hidden ?? {}).map(([k, v]) => v != null && <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <div aria-live="polite">
        {state?.message && <p className={`notice mt-4 ${state.ok ? "" : "error"}`}>{state.message}</p>}
      </div>
    </form>
  );
}

export function Submit({ children, className = "btn btn-primary", pending: pendingLabel = "Saving…", ...rest }: {
  children: ReactNode; className?: string; pending?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-disabled={pending} {...rest} onClick={(e) => { if (pending) e.preventDefault(); }}>
      {pending ? pendingLabel : children}
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
