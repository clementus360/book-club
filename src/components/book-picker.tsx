"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ManualFields } from "@/components/manual-fields";
import { resolveManual, resolveSearchResult, type Candidate, type Resolution } from "@/lib/actions/books";
import { cacheKey, LOCAL_DELAY, PROVIDER_DELAY, PROVIDER_GAP, tidy, worthSearching } from "@/lib/books/live-search";
import { languageName } from "@/lib/books/normalize";
import { SOURCE_LABELS, type SearchResult } from "@/lib/books/types";
import type { Tables } from "@/lib/database.types";
import { BookCover } from "./book-cover";
import { Icon } from "./icon";
import { trouble } from "@/lib/trouble";

type Found = { local: Candidate[]; results: SearchResult[]; unavailable: string[] };
/** Answers already received, for as long as the tab is open. */
const answers = new Map<string, Found>();
type Step =
  | { at: "search" } | { at: "manual" }
  | { at: "choose"; candidates: Candidate[]; again: () => Promise<Resolution> }
  | { at: "confirm"; book: Candidate };

function Option({ book, source, onClick, disabled }: { book: Omit<Candidate, "id" | "metadata_source" | "edition_note"> & { edition_note?: string | null; original_title?: string | null }; source: string; onClick: () => void; disabled: boolean }) {
  const facts = [book.volume_number && `Volume ${book.volume_number}`, book.publication_year, book.publisher, languageName(book.language), book.edition_note].filter(Boolean).join(" · ");
  return (
    <li className="border-t border-rule">
      <button type="button" disabled={disabled} onClick={onClick} className="flex w-full gap-4 py-4 text-left hover:bg-leaf-wash/50 disabled:opacity-60">
        <BookCover book={book} className="w-12" />
        <span className="min-w-0">
          <span className="block font-serif text-[1.0625rem] leading-snug">{book.title}</span>
          {book.subtitle && <span className="block text-sm text-soft">{book.subtitle}</span>}
          {book.original_title && <span className="block font-serif text-sm text-soft">{book.original_title}</span>}
          <span className="block text-sm">{book.authors.join(", ") || "Author unknown"}</span>
          <span className="block text-sm text-soft">{[facts, source].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    </li>
  );
}

/** Lines of JSON, as they arrive. */
async function* lines<T>(res: Response, signal: AbortSignal): AsyncGenerator<T> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      rest += decoder.decode(value, { stream: !done });
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) if (part.trim()) yield JSON.parse(part) as T;
      if (done) return;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Find a book (or enter one), settle any doubt about duplicates, then confirm. */
export function BookPicker({ initialBook, prefill, suggestions = [], suggestionsTitle, confirm }: {
  initialBook?: Candidate | null; prefill?: Partial<Tables<"books">> | null; suggestions?: Candidate[]; suggestionsTitle?: string;
  /** What to do with the book once it is chosen. */
  confirm: (bookId: string) => ReactNode;
}) {
  const [step, setStep] = useState<Step>(initialBook ? { at: "confirm", book: initialBook } : prefill ? { at: "manual" } : { at: "search" });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus();
  }, [step.at]);

  const lastAsked = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopWaiting = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { stopWaiting(); request.current?.abort(); }, []);

  async function ask(text: string, scope: "local" | "all") {
    const key = cacheKey(text);
    const known = answers.get(key);
    if (known) { setFound(known); setSearching(false); return; }
    request.current?.abort();
    const controller = (request.current = new AbortController());
    if (scope === "all") { lastAsked.current = Date.now(); setSearching(true); }
    setProblem(null);
    try {
      const res = await fetch(`/api/books/search?scope=${scope}&q=${encodeURIComponent(tidy(text))}`, { signal: controller.signal });
      if (!res.ok || !res.headers.get("content-type")?.includes("ndjson")) {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (controller.signal.aborted) return;
        // Keep the last catalogue results on screen until new ones arrive, so the list does not flicker.
        setFound((before) => (worthSearching(text) && before ? { ...before, local: body.local } : body));
        return;
      }
      // A full search arrives a piece at a time: each catalogue as soon as it answers.
      let first = true;
      for await (const body of lines<Found & { waiting?: string[]; done?: boolean }>(res, controller.signal)) {
        if (controller.signal.aborted) return;
        // Until a catalogue has answered, keep the last results on screen rather than flicker.
        if (first && !body.results.length && !body.done) setFound((before) => (before ? { ...before, local: body.local } : null));
        else setFound(body);
        first = false;
        setWaiting(body.done ? [] : body.waiting ?? []);
        // Keep only complete answers, so an outage is tried again next time.
        if (body.done && !body.unavailable.length) answers.set(key, { local: body.local, results: body.results, unavailable: [] });
        if (body.done) return;
      }
      throw new Error("The search was interrupted. Please try again.");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (scope === "local") return; // the full search follows
      setFound(null);
      setProblem(error instanceof Error && error.message ? error.message : "The search could not be completed. You can enter the book by hand.");
    } finally {
      if (request.current === controller) setSearching(false);
    }
  }

  /** While typing: our own books after a short pause, the public catalogues after a longer one. */
  function typed(text: string) {
    setQuery(text);
    if (cacheKey(text) === cacheKey(query)) return; // only the spacing changed
    stopWaiting();
    const known = answers.get(cacheKey(text));
    if (known) { request.current?.abort(); setSearching(false); setProblem(null); setFound(known); return; }
    if ([...tidy(text)].length < 2) { request.current?.abort(); setSearching(false); setFound(null); setProblem(null); return; }
    timers.current.push(setTimeout(() => void ask(text, "local"), LOCAL_DELAY));
    if (worthSearching(text)) {
      setSearching(true);
      const wait = Math.max(PROVIDER_DELAY, lastAsked.current + PROVIDER_GAP - Date.now());
      timers.current.push(setTimeout(() => void ask(text, "all"), wait));
    } else setSearching(false);
  }

  function settle(run: (separate: boolean) => Promise<Resolution>, separate = false) {
    setProblem(null);
    start(async () => {
      try {
        const r = await run(separate);
        if (r.status === "ok") setStep({ at: "confirm", book: r.book });
        else if (r.status === "choose") setStep({ at: "choose", candidates: r.candidates, again: () => run(true) });
        else setProblem(r.message);
      } catch (error) {
        setProblem(trouble(error).message);
      }
    });
  }

  const nothing = found && !found.local.length && !found.results.length;

  return (
    <div>
      {step.at === "search" && (
        <>
          <h2 ref={heading} tabIndex={-1} className="sr-only">Find a book</h2>
          <form role="search" className="form" onSubmit={(e) => { e.preventDefault(); stopWaiting(); if ([...tidy(query)].length > 1) void ask(query, "all"); }}>
            <div>
              <label htmlFor="book-query" className="label">Title, author or ISBN, in any language</label>
              <div className="relative">
                <input id="book-query" type="search" value={query} onChange={(e) => typed(e.target.value)} className="input pl-9" autoComplete="off" enterKeyHint="search" maxLength={200} aria-describedby="book-query-hint" />
                <Icon of={Search} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-soft" />
              </div>
              <p id="book-query-hint" className="hint">Just start typing. Results appear as you go.</p>
            </div>
          </form>
          <div aria-live="polite" className="mt-4">
            {searching && <p className="meta">{found?.results.length && waiting.length === 1 ? `Still looking in ${waiting[0]}…` : "Searching…"}</p>}
            {problem && <p className="notice error">{problem}</p>}
            {found && found.unavailable.length > 0 && !searching && <p className="meta">{found.unavailable.join(" and ")} could not be reached just now, so some books may be missing. Press Enter to try again.</p>}
            {nothing && !searching && <p className="py-4 font-serif text-lg">Nothing found for that. Try another spelling, or enter the book by hand.</p>}
          </div>
          {found && (
            <>
              {found.local.length > 0 && (
                <section className="mt-8"><h3 className="rubric mb-2">Already in Commonplace</h3>
                  <ul>{found.local.map((b) => <Option key={b.id} book={b} source="" disabled={busy} onClick={() => setStep({ at: "confirm", book: b })} />)}</ul>
                </section>
              )}
              {found.results.length > 0 && (
                <section className="mt-8"><h3 className="rubric mb-2">From book catalogues</h3>
                  <ul>{found.results.map(({ record, token }) => <Option key={token.slice(-43)} book={record} source={SOURCE_LABELS[record.metadata_source]} disabled={busy} onClick={() => settle((s) => resolveSearchResult(token, s))} />)}</ul>
                </section>
              )}
            </>
          )}
          {!found && !searching && suggestions.length > 0 && (
            <section className="mt-8"><h3 className="rubric mb-2">{suggestionsTitle}</h3>
              <ul>{suggestions.map((b) => <Option key={b.id} book={b} source="" disabled={busy} onClick={() => setStep({ at: "confirm", book: b })} />)}</ul>
            </section>
          )}
          <p className="mt-8">Can’t find it? <button type="button" className="link" onClick={() => { setProblem(null); setStep({ at: "manual" }); }}>Enter the book by hand</button></p>
        </>
      )}

      {step.at === "manual" && (
        <>
          <h2 ref={heading} tabIndex={-1} className="mb-5 text-xl outline-none">Enter a book by hand</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); settle((s) => resolveManual(form, s)); }}>
            <ManualFields book={prefill ?? undefined} />
            {problem && <p role="alert" className="notice error mb-4">{problem}</p>}
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
              <button type="button" className="btn btn-plain" onClick={() => { setProblem(null); setStep({ at: "search" }); }}>Back to search</button>
            </div>
          </form>
        </>
      )}

      {step.at === "choose" && (
        <>
          <h2 ref={heading} tabIndex={-1} className="text-xl outline-none">Is it one of these?</h2>
          <p className="mt-2 mb-4 text-soft">Commonplace already has something that looks similar. If it is the same edition or volume, choose it.</p>
          <ul className="border-b border-rule">{step.candidates.map((b) => <Option key={b.id} book={b} source="" disabled={busy} onClick={() => setStep({ at: "confirm", book: b })} />)}</ul>
          {problem && <p role="alert" className="notice error mt-4">{problem}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-plain" disabled={busy} onClick={() => settle(step.again)}>{busy ? "Adding…" : "No, mine is a different edition"}</button>
            <button type="button" className="btn btn-plain" onClick={() => setStep({ at: "search" })}>Back</button>
          </div>
        </>
      )}

      {step.at === "confirm" && (
        <>
          <div className="block-gap flex gap-5">
            <BookCover book={step.book} className="w-24" priority />
            <div className="min-w-0">
              <h2 ref={heading} tabIndex={-1} className="text-2xl leading-snug outline-none">{step.book.title}</h2>
              <p className="text-soft">{step.book.authors.join(", ") || "Author unknown"}</p>
              {step.book.volume_number && <p className="meta">Volume {step.book.volume_number}</p>}
              <button type="button" className="btn-text mt-1" onClick={() => { setProblem(null); setStep({ at: "search" }); }}>Choose a different book</button>
            </div>
          </div>
          <div className="form">{confirm(step.book.id)}</div>
        </>
      )}
    </div>
  );
}
