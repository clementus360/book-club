export function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <article className="max-w-2xl pt-14 lg:pt-20 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_p]:mb-4">
      <h1 className="page-title">{title}</h1>
      <p className="meta mt-3 !mb-10">Last updated {updated}</p>
      {children}
      <h2>Contact</h2>
      <p>{contact ? <>Write to <a className="link" href={`mailto:${contact}`}>{contact}</a>.</> : "Contact whoever runs this installation of Commonplace."}</p>
    </article>
  );
}
