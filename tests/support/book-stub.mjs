// Canned provider responses so end-to-end tests do not lean on public services.
const WORKS = [
  ["OL1W", "The Left Hand of Darkness", ["Ursula K. Le Guin"], 1969, 10618463],
  ["OL2W", "Kindred", ["Octavia E. Butler"], 1979, null],
  ["OL3W", "Nervous Conditions", ["Tsitsi Dangarembga"], 1988, null],
  ["OL4W", "Solaris", ["Stanisław Lem"], 1961, null],
];
export function bookStub(url, res) {
  const json = (v, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  if (url.pathname.endsWith("/search.json")) {
    if (q.includes("outage")) return json({}, 503);
    if (q.includes("monster")) return json({ docs: [1, 2].map((n) => ({ key: "/works/OL9W", title: `Monster, Vol. ${n}`, author_name: ["Naoki Urasawa"], editions: { docs: [{ key: `/books/OL9${n}M`, title: `Monster, Vol. ${n}` }] } })) });
    return json({ docs: WORKS.filter((w) => w[1].toLowerCase().includes(q) || w[2].some((a) => a.toLowerCase().includes(q))).map(([key, title, author_name, first_publish_year, cover_i]) => ({ key: `/works/${key}`, title, author_name, first_publish_year, cover_i })) });
  }
  if (url.pathname.includes("/works/")) return json({ description: "A description from the work record.", subjects: ["Fiction"] });
  if (url.pathname.includes("/books/v1/volumes")) return json({ error: { code: 429 } }, 429);
  return json({}, 404);
}
