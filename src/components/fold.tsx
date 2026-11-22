import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/** A row that stays closed until someone wants it. */
export function Fold({ title, note, icon, children }: { title: string; note?: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <details className="group row-sm">
      <summary data-hint={note ?? "Opens this section."} className="flex min-h-11 list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3.5">{icon && <Icon of={icon} size="1.25rem" className="text-soft" />}<span><span className="block font-serif text-lg leading-snug">{title}</span>{note && <span className="meta block">{note}</span>}</span></span>
        <Icon of={ChevronDown} size="1.25rem" className="text-soft transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-5 pb-3">{children}</div>
    </details>
  );
}
