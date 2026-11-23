"use client";

import { addToClub, addToLibrary, type Candidate } from "@/lib/actions/books";
import { nominate } from "@/lib/actions/cycles";
import type { Tables } from "@/lib/database.types";
import { words, type Kind } from "@/lib/kinds";
import { BookPicker } from "./book-picker";
import { ActionForm, Submit } from "./forms/action-form";
import { TextArea } from "./forms/fields";

type Common = { initialBook?: Candidate | null; prefill?: Partial<Tables<"books">> | null; kind?: Kind };

export function AddToLibrary(props: Common) {
  const w = words(props.kind);
  return (
    <BookPicker {...props} confirm={(bookId) => (
      <ActionForm action={addToLibrary} hidden={{ book_id: bookId }}>
        <fieldset className="mb-6">
          <legend className="label">Where are you with it?</legend>
          {[["want_to_read", w.want], ["currently_reading", w.now], ["read", w.done]].map(([v, l], i) => (
            <label key={v} className="choice"><input type="radio" name="status" value={v} defaultChecked={i === 0} />{l}</label>
          ))}
        </fieldset>
        <Submit pending="Adding…">{`Add to ${w.mine.toLowerCase()}`}</Submit>
      </ActionForm>
    )} />
  );
}

export function AddToClub({ clubId, clubName, ...props }: Common & { clubId: string; clubName: string }) {
  return (
    <BookPicker {...props} confirm={(bookId) => (
      <ActionForm action={addToClub} hidden={{ club_id: clubId, book_id: bookId }}>
        <p className="mb-5 text-soft">Everyone in {clubName} will see it on the club shelf. It does not go into the vote.</p>
        <Submit pending="Adding…">Add to the club shelf</Submit>
      </ActionForm>
    )} />
  );
}

export function Nominate({ cycleId, nominationId, explanation, suggestions, ...props }: Common & {
  cycleId: string; nominationId: string | null; explanation: string | null; suggestions: Candidate[];
}) {
  const w = words(props.kind);
  return (
    <BookPicker {...props} suggestions={suggestions} suggestionsTitle="Or pick one from the club shelf" confirm={(bookId) => (
      <ActionForm action={nominate} hidden={{ cycle_id: cycleId, nomination_id: nominationId, book_id: bookId }}>
        <TextArea label={`Why this ${w.one}? (optional)`} name="explanation" maxLength={4000} rows={5} defaultValue={explanation ?? ""} hint="The club will read this beside your nomination." />
        <Submit pending="Nominating…">{nominationId ? "Change my nomination" : `Nominate this ${w.one}`}</Submit>
      </ActionForm>
    )} />
  );
}
