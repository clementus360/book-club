"use client";

import { useState } from "react";
import { submitBallot } from "@/lib/actions/cycles";
import { BookCover } from "./book-cover";
import { ActionForm, Submit } from "./forms/action-form";

type Entry = { id: string; book: { title: string; authors: string[]; cover_url: string | null } };

/** Ordering with plain buttons works the same by touch, mouse, keyboard and screen reader. */
export function Ballot({ cycleId, entries, submitted }: { cycleId: string; entries: Entry[]; submitted: boolean }) {
  const [order, setOrder] = useState(entries);
  const [said, setSaid] = useState("");

  function move(from: number, to: number) {
    const item = order[from];
    if (!item || to < 0 || to >= order.length) return;
    const next = order.toSpliced(from, 1).toSpliced(to, 0, item);
    setOrder(next);
    setSaid(`${item.book.title} is now number ${to + 1} of ${order.length}.`);
  }

  return (
    <ActionForm action={submitBallot} hidden={{ cycle_id: cycleId }}>
      <ol className="mb-5 border-y border-rule py-4">
        {order.map(({ id, book }, i) => (
          <li key={id} className="row-sm flex items-center gap-3 sm:gap-5">
            <input type="hidden" name="ranking" value={id} />
            <span className="w-7 shrink-0 text-center font-serif text-2xl text-rubric" aria-hidden>{i + 1}</span>
            <BookCover book={book} className="w-11" />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-lg leading-snug">{book.title}</span>
              <span className="meta block truncate">{book.authors.join(", ")}</span>
            </span>
            <span className="flex shrink-0">
              <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${book.title} up`} className="grid size-11 place-items-center text-lg hover:bg-leaf-wash disabled:opacity-25">↑</button>
              <button type="button" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${book.title} down`} className="grid size-11 place-items-center text-lg hover:bg-leaf-wash disabled:opacity-25">↓</button>
            </span>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">{said}</p>
      <Submit pending="Sending…">{submitted ? "Update my vote" : "Send my vote"}</Submit>
    </ActionForm>
  );
}
