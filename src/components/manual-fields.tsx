import { Field, Select, TextArea } from "@/components/forms/fields";
import { FORMAT_LABELS } from "@/lib/books/types";
import type { Tables } from "@/lib/database.types";

export function ManualFields({ book }: { book?: Partial<Tables<"books">> }) {
  return (
    <>
      <Field label="Title" name="title" required maxLength={500} defaultValue={book?.title} />
      <Field label="Author or authors" name="authors" maxLength={1000} defaultValue={book?.authors?.join(", ")} hint="Separate several names with commas." />
      <div className="grid gap-x-5 sm:grid-cols-2">
        <Field label="Original title" name="original_title" maxLength={500} defaultValue={book?.original_title ?? ""} hint="If it is a translation." />
        <Select label="Format" name="format" defaultValue={book?.format ?? ""}>
          <option value="">Not specified</option>
          {Object.entries(FORMAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Field label="Series" name="series_title" maxLength={300} defaultValue={book?.series_title ?? ""} />
        <Field label="Volume" name="volume_number" maxLength={20} defaultValue={book?.volume_number ?? ""} />
        <Field label="Language" name="language" maxLength={20} defaultValue={book?.language ?? ""} hint="A code such as en, ja or ko." />
        <Field label="Year published" name="publication_year" inputMode="numeric" defaultValue={book?.publication_year ?? ""} />
      </div>
      <details className="mb-5">
        <summary className="link inline-block py-2">More details</summary>
        <div className="mt-3 grid gap-x-5 sm:grid-cols-2">
          <Field label="Subtitle" name="subtitle" maxLength={500} defaultValue={book?.subtitle ?? ""} />
          <Field label="Edition" name="edition_note" maxLength={200} defaultValue={book?.edition_note ?? ""} hint="Deluxe, omnibus, abridged…" />
          <Field label="Publisher" name="publisher" maxLength={300} defaultValue={book?.publisher ?? ""} />
          <Field label="Pages" name="page_count" inputMode="numeric" defaultValue={book?.page_count ?? ""} />
          <Field label="ISBN" name="isbn" defaultValue={book?.isbn_13 ?? book?.isbn_10 ?? ""} />
          <Field label="Cover image address" name="cover_url" type="url" defaultValue={book?.cover_url ?? ""} hint="Starts with https://" />
        </div>
        <TextArea label="Description" name="description" rows={4} maxLength={10000} defaultValue={book?.description ?? ""} />
      </details>
    </>
  );
}
