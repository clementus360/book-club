"use client";

import { Labelled } from "@/components/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { helpFor } from "@/lib/help";
import type { Kind } from "@/lib/kinds";
import { CircleQuestionMark } from "lucide-react";
import { Icon } from "./icon";
import { Dialog, useCloseDialog } from "./forms/dialog";
import { hintsOff, setHintsOff } from "./hint-layer";

function Body({ kind }: { kind: Kind }) {
  const path = usePathname();
  const help = helpFor(path, kind);
  const close = useCloseDialog();
  const [off, setOff] = useState(hintsOff);
  return (
    <>
      <p className="text-lg">{help.about}</p>
      <h3 className="rubric mt-5 mb-2">What you can do here</h3>
      <ul className="space-y-2.5">
        {help.todo.map((t) => <li key={t} className="flex gap-3"><span aria-hidden className="text-rubric">·</span><span>{t}</span></li>)}
      </ul>
      <label className="choice mt-6 border-t border-rule pt-4">
        <input type="checkbox" checked={!off} onChange={(e) => { setHintsOff(!e.target.checked); setOff(!e.target.checked); }} />
        <span>Explain buttons before I use them<span className="block text-sm text-soft">Rest the pointer on a button, or on a phone, tap one that does something straight away.</span></span>
      </label>
      <Link href="/app/help" className="btn btn-plain mt-5" onClick={close}><Labelled>Read the full guide</Labelled></Link>
    </>
  );
}

export function HelpButton({ className, kind = "book" }: { className: string; kind?: Kind }) {
  const title = helpFor(usePathname(), kind).title;
  return <Dialog trigger={<><Icon of={CircleQuestionMark} /><span>Help<span className="hidden sm:inline"> with this page</span></span></>} triggerClass={className} title={title}><Body kind={kind} /></Dialog>;
}
