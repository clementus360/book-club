import type { ReactNode } from "react";

/** A row that stays closed until someone wants it. */
export function Fold({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <details className="group row-sm">
      <summary data-hint={note ?? "Opens this section."} className="flex min-h-11 list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span><span className="block font-serif text-lg leading-snug">{title}</span>{note && <span className="meta block">{note}</span>}</span>
        <span aria-hidden className="shrink-0 text-xl text-soft transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="pt-5 pb-3">{children}</div>
    </details>
  );
}
