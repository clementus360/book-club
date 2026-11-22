"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { helpFor } from "@/lib/help";
import { Dialog, useCloseDialog } from "./forms/dialog";
import { hintsOff, setHintsOff } from "./hint-layer";

function Body() {
  const path = usePathname();
  const help = helpFor(path);
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
      <Link href="/app/help" className="btn btn-plain mt-5" onClick={close}>Read the full guide</Link>
    </>
  );
}

export function HelpButton({ className }: { className: string }) {
  const title = helpFor(usePathname()).title;
  return <Dialog trigger={<>Help<span className="hidden sm:inline"> with this page</span></>} triggerClass={className} title={title}><Body /></Dialog>;
}
