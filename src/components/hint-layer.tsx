"use client";

import { useEffect, useRef, useState } from "react";
import { hintFor, type Hint } from "@/lib/hints";
import { isKind } from "@/lib/kinds";

const SELECTOR = "button, a.btn, a.btn-text, nav a, summary, [data-hint]";
const SEEN = "commonplace:explained";
const OFF = "commonplace:hints-off";

const read = (key: string) => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* a convenience only */ } };
export const hintsOff = () => read(OFF) === "1";
export const setHintsOff = (off: boolean) => write(OFF, off ? "1" : "");

function labelOf(el: Element): string {
  // Screen-reader-only words are not part of the label people see.
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return el.getAttribute("aria-label") ?? copy.textContent ?? "";
}

function find(target: EventTarget | null): { el: HTMLElement; hint: Hint } | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(SELECTOR) : null;
  if (!el) return null;
  const own = el.dataset.hint;
  const kind = el.closest<HTMLElement>("[data-kind]")?.dataset.kind;
  const hint = own ? { text: own } : hintFor(labelOf(el), isKind(kind) ? kind : "book");
  return hint ? { el, hint } : null;
}

type Shown = { text: string; x: number; y: number; below: boolean; el: HTMLElement; ask: boolean };

/**
 * One popup for the whole app. On hover or keyboard focus it explains a control;
 * on touch, where there is no hover, it explains an action the first time it is
 * tapped and waits for "Go ahead".
 */
export function HintLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const passThrough = useRef(false);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let asking = false;
    let quiet: HTMLElement | null = null; // just clicked: do not explain until the pointer comes back

    const hide = () => {
      clearTimeout(timer.current);
      current?.removeAttribute("aria-describedby");
      current = null;
      asking = false;
      setShown(null);
    };
    const show = (el: HTMLElement, text: string, ask = false) => {
      const r = el.getBoundingClientRect();
      const below = r.top < 110;
      const half = Math.min(150, (window.innerWidth - 24) / 2);
      hide();
      current = el;
      asking = ask;
      if (!ask && !el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", "hint-popup");
      setShown({ text, el, ask, below, x: Math.max(12 + half, Math.min(window.innerWidth - 12 - half, r.left + r.width / 2)), y: below ? r.bottom + 8 : r.top - 8 });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || asking || hintsOff()) return;
      if (tip.current?.contains(e.target as Node)) return clearTimeout(timer.current);
      const found = find(e.target);
      if (quiet && found?.el !== quiet) quiet = null;
      clearTimeout(timer.current);
      if (found && found.el === current) return;
      if (found && found.el !== quiet && !(found.el as HTMLButtonElement).disabled) timer.current = setTimeout(() => show(found.el, found.hint.text), 450);
      else timer.current = setTimeout(hide, 120); // long enough to move onto the popup
    };
    const focus = (e: FocusEvent) => {
      if (hintsOff()) return;
      const found = find(e.target);
      if (found && found.el.matches(":focus-visible")) show(found.el, found.hint.text);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    const down = (e: PointerEvent) => {
      if (tip.current?.contains(e.target as Node)) return;
      quiet = find(e.target)?.el ?? null;
      hide();
    };
    const click = (e: MouseEvent) => {
      if (passThrough.current || hintsOff() || (e as PointerEvent).pointerType !== "touch") return;
      const found = find(e.target);
      if (!found?.hint.acts || found.el.closest("dialog")) return;
      if (read(SEEN).split("\n").includes(found.hint.text)) return;
      e.preventDefault();
      e.stopPropagation();
      show(found.el, found.hint.text, true);
    };
    const blur = () => { if (!asking) hide(); }; // tapping "Go ahead" moves focus
    const scroll = () => hide();

    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    document.addEventListener("click", click, true);
    window.addEventListener("scroll", scroll, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("click", click, true);
      window.removeEventListener("scroll", scroll, true);
    };
  }, []);

  // The top layer, so it also appears above dialogs.
  useEffect(() => {
    const el = tip.current;
    if (!el) return;
    if (shown && !el.matches(":popover-open")) el.showPopover();
    if (shown?.ask) el.querySelector("button")?.focus();
    if (!shown && el.matches(":popover-open")) el.hidePopover();
  }, [shown]);

  function goAhead() {
    if (!shown) return;
    write(SEEN, [read(SEEN), shown.text].filter(Boolean).join("\n"));
    const el = shown.el;
    setShown(null);
    passThrough.current = true;
    el.click();
    passThrough.current = false;
  }

  return (
    <div ref={tip} id="hint-popup" popover="manual" role={shown?.ask ? "alertdialog" : "tooltip"} aria-label={shown?.ask ? "What this does" : undefined}
      className="m-0 w-max max-w-[min(300px,calc(100vw-24px))] border-0 bg-ink px-3.5 py-2.5 text-sm leading-snug text-sheet shadow-[0_6px_24px_rgb(33_31_27/0.28)]"
      style={shown ? { position: "fixed", inset: "auto", left: shown.x, top: shown.y, transform: `translate(-50%, ${shown.below ? "0" : "-100%"})` } : undefined}>
      {shown?.text}
      {shown?.ask && (
        <span className="mt-2.5 flex gap-2">
          <button type="button" className="min-h-11 flex-1 bg-sheet px-4 font-medium text-ink" onClick={goAhead}>Go ahead</button>
          <button type="button" className="min-h-11 flex-1 border border-sheet/50 px-4" onClick={() => setShown(null)}>Not now</button>
        </span>
      )}
    </div>
  );
}
