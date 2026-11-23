import { Avatar, nameOf, Rating, Section } from "@/components/ui";
import { ActionButton } from "@/components/forms/action-form";
import { FormDialog } from "@/components/forms/dialog";
import { Field, RatingField, TextArea } from "@/components/forms/fields";
import { addNote, addQuestion, deleteRecord, editNote, editQuestion, saveClubReview } from "@/lib/actions/meetings";
import type { Discussion as Data } from "@/lib/data/club";
import { formatDate } from "@/lib/dates";
import { words, type Kind } from "@/lib/kinds";

type Ctx = { clubId: string; cycleId?: string | null; meetingId?: string | null; userId: string; isAdmin: boolean; zone: string; clubKind?: Kind };
type Note = Data["notes"][number];

const Remove = ({ table, id }: { table: string; id: string }) => (
  <ActionButton action={deleteRecord} hidden={{ table, id }} className="btn-text danger text-sm" pending="Removing…">Remove</ActionButton>
);

const isBook = (ctx: Ctx) => (ctx.clubKind ?? "book") === "book";
const SOURCE_EXAMPLE: Record<Kind, string> = { book: "p. 112", film: "Near the end", series: "Episode 4", anime: "Episode 4", game: "Chapter 3" };

export function Notes({ notes, ctx, kind }: { notes: Note[]; ctx: Ctx; kind: "note" | "quotation" }) {
  const quotes = kind === "quotation";
  return (
    <>
      {notes.map((n) => (
        <article key={n.id} className="row">
          {quotes ? <blockquote className="written border-l-2 border-rubric/60 pl-4 text-lg">{n.content}</blockquote> : <p className="written max-w-prose">{n.content}</p>}
          <footer className="links">
            <p className="meta">{n.source && `${n.source}. `}{quotes ? "Noted by " : ""}{nameOf(n.author)}, {formatDate(n.created_at, ctx.zone)}</p>
            {n.created_by === ctx.userId && (
              <FormDialog trigger="Edit" triggerClass="btn-text text-sm" title={quotes ? "Edit the quotation" : "Edit your note"} action={editNote} hidden={{ id: n.id }} submit="Save">
                <TextArea label={quotes ? "Quotation" : "Note"} name="content" required rows={6} maxLength={10000} defaultValue={n.content} />
                {quotes && <Field label="Where it is from (optional)" name="source" maxLength={200} defaultValue={n.source ?? ""} />}
              </FormDialog>
            )}
            {(n.created_by === ctx.userId || ctx.isAdmin) && <Remove table="discussion_notes" id={n.id} />}
          </footer>
        </article>
      ))}
    </>
  );
}

export function AddNote({ ctx, kind }: { ctx: Ctx; kind: "note" | "quotation" }) {
  const quotes = kind === "quotation";
  return (
    <FormDialog trigger={quotes ? "Add a quotation" : "Add a note"} triggerClass="btn-text" title={quotes ? (isBook(ctx) ? "A passage worth keeping" : "A line worth keeping") : "A note for the club"} action={addNote}
      hidden={{ club_id: ctx.clubId, cycle_id: ctx.cycleId, meeting_id: ctx.meetingId, kind }} submit="Add">
      <TextArea label={quotes ? "Quotation" : "Note"} name="content" required rows={6} maxLength={10000} hint="Everyone in the club can read this." />
      {quotes && <Field label="Where it is from (optional)" name="source" maxLength={200} placeholder={SOURCE_EXAMPLE[ctx.clubKind ?? "book"]} />}
    </FormDialog>
  );
}

export function DiscussionSections({ data, ctx, canReview, writable }: { data: Data; ctx: Ctx; canReview: boolean; writable: boolean }) {
  const notes = data.notes.filter((n) => n.kind === "note");
  const quotes = data.notes.filter((n) => n.kind === "quotation");
  const myReview = data.reviews.find((r) => r.created_by === ctx.userId);
  return (
    <>
      <Section title="Questions to talk about" note="For when you meet. Everyone in the club can read them." id="questions" aside={writable && (
        <FormDialog trigger="Add a question" triggerClass="btn-text" title="A question to discuss" action={addQuestion} hidden={{ club_id: ctx.clubId, cycle_id: ctx.cycleId }} submit="Add">
          <TextArea label="Question" name="question" required rows={4} maxLength={2000} />
        </FormDialog>
      )}>
        {data.questions.length === 0 ? <p className="text-soft">No questions yet.</p> : (
          <ol>
            {data.questions.map((q) => (
              <li key={q.id} className="row">
                <p className="written max-w-prose">{q.question}</p>
                <div className="links">
                  <span className="meta">{nameOf(q.author)}</span>
                  {q.created_by === ctx.userId && (
                    <FormDialog trigger="Edit" triggerClass="btn-text text-sm" title="Edit your question" action={editQuestion} hidden={{ id: q.id }} submit="Save">
                      <TextArea label="Question" name="question" required rows={4} maxLength={2000} defaultValue={q.question} />
                    </FormDialog>
                  )}
                  {(q.created_by === ctx.userId || ctx.isAdmin) && <Remove table="discussion_questions" id={q.id} />}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={isBook(ctx) ? "Passages worth keeping" : "Lines worth keeping"} note={`Lines from the ${words(ctx.clubKind).one} you want to remember.`} id="passages" aside={writable && <AddNote ctx={ctx} kind="quotation" />}>
        {quotes.length ? <Notes notes={quotes} ctx={ctx} kind="quotation" /> : <p className="text-soft">No quotations yet.</p>}
      </Section>

      <Section title="Notes" note="Thoughts for the whole club." id="notes" aside={writable && <AddNote ctx={ctx} kind="note" />}>
        {notes.length ? <Notes notes={notes} ctx={ctx} kind="note" /> : <p className="text-soft">No notes yet.</p>}
      </Section>

      {canReview && (
        <Section title="What the club thought" note="Reviews everyone in the club can read. Separate from your private one." id="reviews" aside={
          <FormDialog trigger={myReview ? "Edit my club review" : "Write a club review"} triggerClass="btn-text" title="Your review for the club" action={saveClubReview} hidden={{ cycle_id: ctx.cycleId }} submit="Save review">
            <p className="mb-5 text-soft">Everyone in the club can read this. It is separate from the private review in your own library.</p>
            <RatingField defaultValue={myReview?.rating} />
            <TextArea label="Review" name="review_text" required rows={7} maxLength={20000} defaultValue={myReview?.review_text ?? ""} />
          </FormDialog>
        }>
          {data.reviews.length === 0 ? <p className="text-soft">No club reviews yet.</p> : data.reviews.map((r) => (
            <article key={r.id} className="row">
              <header className="mb-2 flex flex-wrap items-center gap-x-2.5"><Avatar person={r.author} className="size-7 text-xs" /><span>{nameOf(r.author)}</span><Rating value={r.rating} /></header>
              <p className="written max-w-prose">{r.review_text}</p>
              {(r.created_by === ctx.userId || ctx.isAdmin) && <div className="links"><Remove table="book_reviews" id={r.id} /></div>}
            </article>
          ))}
        </Section>
      )}
    </>
  );
}
