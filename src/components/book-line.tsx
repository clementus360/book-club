import Link from "next/link";
import type { ReactNode } from "react";
import { FORMAT_LABELS } from "@/lib/books/types";
import { languageName } from "@/lib/books/normalize";
import type { Tables } from "@/lib/database.types";
import { BookCover } from "./book-cover";

type Book = Tables<"books">;

export const authorsOf = (b: { authors: string[] }) => b.authors.join(", ") || "Author unknown";

export function volumeLabel(b: Pick<Book, "volume_number" | "title">): string | null {
  return b.volume_number && !/\b(vol|volume)\b/i.test(b.title) ? `Volume ${b.volume_number}` : null;
}

export function bookFacts(b: Pick<Book, "publication_year" | "format" | "language" | "volume_number" | "title" | "edition_note">): string {
  return [volumeLabel(b), b.publication_year, b.format && FORMAT_LABELS[b.format], b.language && b.language !== "en" ? languageName(b.language) : null, b.edition_note].filter(Boolean).join(" · ");
}

/** A book as it appears in any list. */
export function BookLine({ book, href = `/app/books/${book.id}`, children, aside }: { book: Book; href?: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <article className="row flex gap-4 sm:gap-5">
      <Link href={href} tabIndex={-1} aria-hidden className="shrink-0"><BookCover book={book} className="w-16 sm:w-20" /></Link>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg leading-snug"><Link href={href} className="hover:underline underline-offset-4">{book.title}</Link></h3>
        {book.original_title && <p className="meta font-serif">{book.original_title}</p>}
        <p className="text-soft">{authorsOf(book)}</p>
        {bookFacts(book) && <p className="meta">{bookFacts(book)}</p>}
        {children && <div className="mt-2">{children}</div>}
        {aside && <div className="links">{aside}</div>}
      </div>
    </article>
  );
}
