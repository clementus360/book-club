import { Lock, NotebookPen } from "lucide-react";
import { Labelled } from "@/components/icon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { volumeLabel } from "@/components/book-line";
import { ActionButton, ActionForm, Submit } from "@/components/forms/action-form";
import { Fold } from "@/components/fold";
import { FormDialog } from "@/components/forms/dialog";
import { Checkbox, Field, RatingField, Select, TextArea } from "@/components/forms/fields";
import { ManualFields } from "@/components/manual-fields";
import { RecommendDialog } from "@/components/recommend-form";
import { BookHeader, Fact, Facts, nameOf, Rating, Section, Side, WithMargin } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { addToClub, addToLibrary, removeFromClub, removeFromLibrary, savePersonalReview, updateLibraryEntry, updateManualBook } from "@/lib/actions/books";
import { languageName } from "@/lib/books/normalize";
import { FORMAT_LABELS, SOURCE_LABELS } from "@/lib/books/types";
import { METHOD_LABEL, STATUS_LABEL } from "@/lib/cycle";
import { formatDate } from "@/lib/dates";
import { getViewer, must } from "@/lib/viewer";

export const metadata: Metadata = { title: "Book" };

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, userId, clubs, club } = await getViewer();
  const { data: book } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
  if (!book) notFound();

  const none = Promise.resolve({ data: null, error: null });
  const [entry, review, recs, editable, shelf, cycles, nominations, active] = await Promise.all([
    supabase.from("user_books").select("*").eq("user_id", userId).eq("book_id", id).maybeSingle(),
    supabase.from("personal_reviews").select("rating, review_text").eq("user_id", userId).eq("book_id", id).maybeSingle(),
    supabase.from("club_recommendations").select("id, club_id, recommended_by, recommendation_text, shared_rating, shared_review_text, created_at, recommender:profiles!club_recommendations_recommended_by_fkey(display_name)").eq("book_id", id).is("withdrawn_at", null).order("created_at"),
    supabase.rpc("can_edit_book", { p_book_id: id }),
    club ? supabase.from("club_books").select("added_at, added_by, source, adder:profiles!club_books_added_by_fkey(display_name)").eq("club_id", club.id).eq("book_id", id).maybeSingle() : none,
    club ? supabase.from("reading_cycles").select("id, number, status, decision_method, completed_at").eq("club_id", club.id).eq("book_id", id).order("number") : none,
    club ? supabase.from("nominations").select("id, explanation, cycle:reading_cycles!nominations_cycle_id_club_id_fkey(id, number, status, book_id), nominator:profiles!nominations_nominated_by_fkey(display_name)").eq("club_id", club.id).eq("book_id", id).is("withdrawn_at", null).order("created_at") : none,
    club ? supabase.from("reading_cycles").select("id, status").eq("club_id", club.id).eq("status", "nominating").maybeSingle() : none,
  ]);
  const mine = entry.data;
  const allRecs = must(recs);
  const clubRecs = allRecs.filter((r) => r.club_id === club?.id);
  const recommendedTo = new Set(allRecs.filter((r) => r.recommended_by === userId).map((r) => r.club_id));
  const zone = club?.timezone;
  const publication = [book.publisher, book.publication_date ?? book.publication_year].filter(Boolean).join(", ");

  return (
    <>
      <BookHeader book={book} kicker={volumeLabel(book) ? `${book.series_title && book.series_title !== book.title ? `${book.series_title}, ` : ""}${volumeLabel(book)}` : "Book"}
        action={
          <>
            {!mine && <ActionButton action={addToLibrary} hidden={{ book_id: id, status: "want_to_read" }} className="btn btn-primary" pending="Adding…">Add to my books</ActionButton>}
            {mine && <RecommendDialog bookId={id} bookTitle={book.title} clubs={clubs.map((c) => ({ id: c.id, name: c.name, done: recommendedTo.has(c.id) }))} review={review.data} />}
            {active.data && !nominations.data?.some((n) => n.cycle?.id === active.data!.id) && <Link className="btn btn-plain" href={`/app/add-book?to=nominate&book=${id}`}>Nominate for {club!.name}</Link>}
            {club && !shelf.data && <ActionButton action={addToClub} hidden={{ club_id: club.id, book_id: id }} pending="Adding…">Add to the club shelf</ActionButton>}
          </>
        } />

      <WithMargin margin={
        <>
          <Side>
            <Facts>
              {publication && <Fact term="Published">{publication}</Fact>}
              {book.format && <Fact term="Format">{FORMAT_LABELS[book.format]}</Fact>}
              {book.language && <Fact term="Language">{languageName(book.language)}</Fact>}
              {book.series_title && <Fact term="Series">{book.series_title}{book.volume_number && `, volume ${book.volume_number}`}</Fact>}
              {book.edition_note && <Fact term="Edition">{book.edition_note}</Fact>}
              {book.page_count && <Fact term="Pages">{book.page_count}</Fact>}
              {(book.isbn_13 || book.isbn_10) && <Fact term="ISBN">{book.isbn_13 ?? book.isbn_10}</Fact>}
              {book.alternative_titles.length > 0 && <Fact term="Also known as">{book.alternative_titles.slice(0, 4).join("; ")}</Fact>}
              <Fact term="Details from">{SOURCE_LABELS[book.metadata_source]}</Fact>
              {club && shelf.data && <Fact term="On the club shelf">Added {shelf.data.added_by ? `by ${nameOf(shelf.data.adder)}, ` : ""}{formatDate(shelf.data.added_at, zone)}</Fact>}
            </Facts>
          </Side>
          <Side>
            <div className="flex flex-col items-start gap-3">
              {editable.data && (
                <FormDialog trigger="Edit book details" triggerClass="link" title="Edit book details" action={updateManualBook} hidden={{ book_id: id }} submit="Save">
                  <ManualFields book={book} />
                </FormDialog>
              )}
              <Link className="link" href={`/app/add-book?like=${id}`}><Labelled>Add another volume</Labelled></Link>
              {club && shelf.data && shelf.data.source === "added" && !clubRecs.length && !nominations.data?.length && !cycles.data?.length && (shelf.data.added_by === userId || club.role === "admin") && (
                <ActionButton action={removeFromClub} hidden={{ club_id: club.id, book_id: id }} className="btn-text danger" pending="Removing…">Remove from club shelf</ActionButton>
              )}
            </div>
          </Side>
        </>
      }>
          {mine && (
            <Section id="mine" title="My review" icon={Lock} note="Only you can see this part of the page." aside={
              <FormDialog trigger="Remove from my books" triggerClass="btn-text danger" title="Remove this book?" action={removeFromLibrary} hidden={{ book_id: id }} submit="Remove it" submitClass="btn btn-danger">
                <p>Your rating, review and notes for {book.title} will be deleted. Anything you shared with a club, and the club’s own history, stays.</p>
              </FormDialog>
            }>
              <ActionForm action={savePersonalReview} hidden={{ book_id: id }} className="form mb-8">
                <RatingField legend="My rating (optional)" defaultValue={review.data?.rating} />
                <TextArea label="My review" name="review_text" rows={6} maxLength={20000} defaultValue={review.data?.review_text ?? ""} hint="Private. Nothing here is shared unless you recommend the book and choose to share it." />
                <Submit>Save review</Submit>
              </ActionForm>
              <div className="border-t border-rule pt-4">
                <Fold icon={NotebookPen} title="Dates, notes and favourites" note="More private details about this book.">
                  <ActionForm action={updateLibraryEntry} hidden={{ book_id: id }} className="form">
                    <div className="grid gap-x-5 sm:grid-cols-3">
                      <Select label="Status" name="status" defaultValue={mine.status}>
                        <option value="want_to_read">Want to read</option><option value="currently_reading">Reading now</option><option value="read">Read</option>
                      </Select>
                      <Field label="Started" name="date_started" type="date" defaultValue={mine.date_started ?? ""} />
                      <Field label="Finished" name="date_finished" type="date" defaultValue={mine.date_finished ?? ""} />
                    </div>
                    <TextArea label="Private notes" name="private_notes" rows={4} maxLength={20000} defaultValue={mine.private_notes ?? ""} />
                    <Checkbox name="is_favourite" defaultChecked={mine.is_favourite} label="One of my favourites" />
                    <div className="mt-5"><Submit>Save entry</Submit></div>
                  </ActionForm>
                </Fold>
              </div>
            </Section>
          )}

          {book.description && <Section title="About the book"><p className="written max-w-prose">{book.description}</p></Section>}

          {club && (clubRecs.length > 0 || (nominations.data?.length ?? 0) > 0 || (cycles.data?.length ?? 0) > 0) && (
            <Section title={`In ${club.name}`}>
              {clubRecs.map((r) => (
                <div key={r.id} className="row">
                  <p className="meta">Recommended by {nameOf(r.recommender)}, {formatDate(r.created_at, zone)} <Rating value={r.shared_rating} /></p>
                  {r.recommendation_text && <p className="written mt-2">{r.recommendation_text}</p>}
                  {r.shared_review_text && <blockquote className="written mt-3 border-l-2 border-rubric/60 pl-4">{r.shared_review_text}</blockquote>}
                </div>
              ))}
              {nominations.data?.map((n) => (
                <div key={n.id} className="row">
                  <p className="meta">Nominated by {nameOf(n.nominator)}</p>
                  {n.explanation && <p className="written mt-2">{n.explanation}</p>}
                </div>
              ))}
              {cycles.data?.map((c) => (
                <p key={c.id} className="row">
                  <Link className="link" href={c.status === "completed" ? `/app/archive/${c.id}` : "/app/current-book"}>{c.completed_at ? `Read by the club, finished ${formatDate(c.completed_at, zone)}` : STATUS_LABEL[c.status]}</Link>
                  {c.decision_method && <span className="meta block">{METHOD_LABEL[c.decision_method]}</span>}
                </p>
              ))}
            </Section>
          )}
      </WithMargin>
    </>
  );
}
