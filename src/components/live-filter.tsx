"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

function useParam(name: string) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    start(() => router.replace(next.size ? `${path}?${next}` : path, { scroll: false }));
  };
  return { value: params.get(name) ?? "", set, pending };
}

/** Filters a list as you type. Waits for a pause, so it asks once per thought. */
export function LiveFilter({ label }: { label: string }) {
  const param = useParam("q");
  const [value, setValue] = useState(param.value);
  const applied = useRef(param.value);
  const set = useRef(param.set);
  useEffect(() => { set.current = param.set; });

  useEffect(() => {
    const q = value.trim();
    if (q === applied.current) return;
    const timer = setTimeout(() => { applied.current = q; set.current(q); }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div role="search" className="min-w-0 flex-1 sm:w-52 sm:flex-none">
      <label htmlFor="q" className="sr-only">{label}</label>
      <input id="q" type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={label} autoComplete="off" className="input" aria-busy={param.pending} />
    </div>
  );
}

export function LiveSelect({ name, label, options }: { name: string; label: string; options: readonly (readonly [string, string])[] }) {
  const param = useParam(name);
  return (
    <div>
      <label htmlFor={`f-${name}`} className="sr-only">{label}</label>
      <select id={`f-${name}`} value={param.value} onChange={(e) => param.set(e.target.value)} className="input" aria-busy={param.pending}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
