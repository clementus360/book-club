import Link from "next/link";
import type { ReactNode } from "react";
import { BookCover } from "./book-cover";

/**
 * Every page opens the same way: a kicker, a title, and a sentence saying what
 * the page is for. `plain` drops the rule where the step strip follows.
 */
export function PageHeader({ kicker, title, children, action, plain = false }: { kicker: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; plain?: boolean }) {
  return (
    <header className={`page-head ${plain ? "plain" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="max-w-2xl min-w-0">
          <p className="rubric mb-1.5">{kicker}</p>
          <h1 className="page-title">{title}</h1>
          {children && <div className="page-lede">{children}</div>}
        </div>
        {action && <div className="flex flex-wrap gap-3">{action}</div>}
      </div>
    </header>
  );
}

/** The same opening, for pages about one book. */
export function BookHeader({ book, kicker, href, facts, action, plain = false }: {
  book: { title: string; subtitle: string | null; original_title: string | null; authors: string[]; cover_url: string | null };
  kicker: ReactNode; href?: string; facts?: ReactNode; action?: ReactNode; plain?: boolean;
}) {
  return (
    <header className={`page-head ${plain ? "plain" : ""}`}>
      <div className="grid gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
        <BookCover book={book} className="w-32 sm:w-40" decorative={false} priority />
        <div className="min-w-0 self-end">
          <p className="rubric mb-1.5">{kicker}</p>
          <h1 className="page-title">{href ? <Link href={href} className="decoration-1 underline-offset-8 hover:underline">{book.title}</Link> : book.title}</h1>
          {book.subtitle && <p className="mt-1.5 font-serif text-xl text-soft">{book.subtitle}</p>}
          {book.original_title && <p className="mt-1.5 font-serif text-lg text-soft">{book.original_title}</p>}
          <p className="mt-2 text-lg">{book.authors.join(", ") || "Author unknown"}</p>
          {facts && <div className="mt-2 text-soft">{facts}</div>}
          {action && <div className="mt-5 flex flex-wrap gap-3">{action}</div>}
        </div>
      </div>
    </header>
  );
}

/** A heading, a rule, then the content. The heading row never wraps its link away. */
export function Section({ title, aside, note, children, id }: { title: ReactNode; aside?: ReactNode; note?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="section">
      <div className="section-head">
        <h2 className="min-w-0 text-xl leading-snug">{title}</h2>
        {aside && <div className="whitespace-nowrap">{aside}</div>}
        {note && <p className="meta col-span-full">{note}</p>}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

/** A whole page, or a whole tab, with nothing in it yet. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <p className="font-serif text-xl leading-snug">{title}</p>
      {children && <div className="mt-1.5 max-w-prose text-soft">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}

/** Main column with a side column for the practical details, like a ruled page. */
export function WithMargin({ children, margin }: { children: ReactNode; margin: ReactNode }) {
  return (
    <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">{children}</div>
      <aside className="side min-w-0 border-t border-rule pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">{margin}</aside>
    </div>
  );
}

/** One block of the side column. The rules between blocks come from `.side`. */
export function Side({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-8">
      {title && <h2 className="side-title">{title}</h2>}
      {children}
    </section>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="space-y-4">{children}</dl>;
}

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-soft">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Tabs sit on the rule; anything that narrows the list sits to their right. */
export function Toolbar({ label, tabs, children }: { label: string; tabs: { href: string; label: ReactNode; current: boolean }[]; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-rule">
      <h2 className="sr-only">{label}</h2>
      <nav aria-label={label} className="-mb-px flex max-w-full gap-x-6 overflow-x-auto whitespace-nowrap">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined}
            className="flex min-h-11 items-center border-b-2 border-transparent text-soft hover:text-ink aria-[current]:border-rubric aria-[current]:text-ink">{t.label}</Link>
        ))}
      </nav>
      {children && <div className="grid w-full gap-3 pb-4 sm:flex sm:w-auto sm:pb-2.5">{children}</div>}
    </div>
  );
}

export function Avatar({ person, className = "size-8 text-sm" }: { person: { display_name: string; avatar_url: string | null } | null; className?: string }) {
  const name = person?.display_name ?? "Former member";
  return person?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" loading="lazy" className={`${className} shrink-0 rounded-full bg-rule object-cover`} />
  ) : (
    <span aria-hidden className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-leaf-wash font-serif text-leaf`}>
      {[...name.trim()][0]?.toUpperCase()}
    </span>
  );
}

export function Rating({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="text-rubric" role="img" aria-label={`${value} out of 5`}>
      <span aria-hidden>{"★".repeat(value)}<span className="text-edge/60">{"★".repeat(5 - value)}</span></span>
    </span>
  );
}

export const nameOf = (p: { display_name: string } | null | undefined) => p?.display_name ?? "A former member";
