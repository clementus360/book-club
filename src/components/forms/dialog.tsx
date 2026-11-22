"use client";

import { createContext, use, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ActionForm, Submit, type FormAction } from "./action-form";

const CloseDialog = createContext<() => void>(() => {});
export const useCloseDialog = () => use(CloseDialog);

/** Native modal dialog: focus is trapped and returned, Escape closes. */
export function Dialog({ trigger, triggerClass = "btn btn-plain", title, children }: {
  trigger: ReactNode; triggerClass?: string; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={triggerClass} aria-haspopup="dialog" onClick={() => {
        flushSync(() => setOpen(true)); // so showModal() can focus inside
        ref.current?.showModal();
      }}>{trigger}</button>
      <dialog ref={ref} aria-labelledby={id} className="sheet" onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === ref.current) close(); }}>
        {open && (
          <>
            <div className="mb-5 flex items-start justify-between gap-6">
              <h2 id={id} className="text-2xl leading-tight">{title}</h2>
              <button type="button" onClick={close} className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center text-2xl leading-none text-soft hover:text-ink" aria-label="Close">×</button>
            </div>
            <CloseDialog value={close}>{children}</CloseDialog>
          </>
        )}
      </dialog>
    </>
  );
}

function DialogForm({ action, hidden, submit, submitClass, children }: {
  action: FormAction; hidden?: Record<string, string | null | undefined>; submit: string; submitClass?: string; children: ReactNode;
}) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} hidden={hidden} onDone={close}>
      {children}
      <div className="mt-6 flex flex-wrap gap-3">
        <Submit className={submitClass}>{submit}</Submit>
        <button type="button" className="btn btn-plain" onClick={close}>Cancel</button>
      </div>
    </ActionForm>
  );
}

/** A dialog holding one form; closes when the action succeeds. */
export function FormDialog({ trigger, triggerClass, title, ...form }: {
  trigger: ReactNode; triggerClass?: string; title: string; action: FormAction;
  hidden?: Record<string, string | null | undefined>; submit: string; submitClass?: string; children: ReactNode;
}) {
  return <Dialog trigger={trigger} triggerClass={triggerClass} title={title}><DialogForm {...form} /></Dialog>;
}
