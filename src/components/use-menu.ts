"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";

/** A <details> that behaves as a menu: closes on navigation, outside clicks and Escape. */
export function useMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !ref.current?.open) return;
    e.stopPropagation(); // close this before anything around it
    ref.current.open = false;
    ref.current.querySelector("summary")?.focus();
  };
  return { ref, onKeyDown, close: () => { if (ref.current) ref.current.open = false; } };
}
