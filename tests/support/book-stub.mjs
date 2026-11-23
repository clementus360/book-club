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
  const path = url.pathname;
  // Films (TMDB), series (TVmaze), anime (AniList) and games (IGDB, via a Twitch token).
  if (path.startsWith("/stub/tmdb/")) {
    if (url.searchParams.get("api_key") !== "tmdb-test") return json({ status_message: "Invalid API key" }, 401);
    if (path.endsWith("/search/movie")) return json({ results: [{ id: 1396, title: "Stalker", original_title: "Сталкер", release_date: "1979-05-25", poster_path: "/stalker.jpg", overview: "A guide leads two men into the Zone.", original_language: "ru" }] });
    if (path.endsWith("/watch/providers")) return json({ results: {} });
    if (/\/3\/movie\/\d+$/.test(path)) return json({ runtime: 161, credits: { crew: [{ job: "Director", name: "Andrei Tarkovsky" }, { job: "Writer", name: "Arkady Strugatsky" }] } });
  }
  if (path.startsWith("/stub/tvmaze/")) {
    if (path.endsWith("/search/shows")) return json([{ show: { id: 82, name: "Twin Peaks", premiered: "1990-04-08", language: "English", summary: "<p>A town with secrets.</p>", network: { name: "ABC" } } }]);
    if (/\/shows\/\d+$/.test(path)) return json({ id: 82, name: "Twin Peaks", network: { name: "ABC" }, _embedded: { episodes: Array.from({ length: 30 }, (_, i) => ({ id: i })), crew: [{ type: "Creator", person: { name: "David Lynch" } }] } });
  }
  if (path === "/stub/anilist") return json({ data: { Page: { media: [{ id: 457, title: { romaji: "Mushishi", english: "Mushi-Shi", native: "蟲師" }, episodes: 26, startDate: { year: 2005 }, studios: { nodes: [{ name: "Artland" }] } }] }, Media: { externalLinks: [{ site: "Crunchyroll", url: "https://www.crunchyroll.com/mushishi", type: "STREAMING" }] } } });
  if (path === "/stub/twitch/token") return json({ access_token: "igdb-token", expires_in: 5000000 });
  if (path === "/stub/igdb/v4/games") return json([
    { id: 11737, name: "Outer Wilds", first_release_date: 1559001600, platforms: [{ name: "PC (Microsoft Windows)" }, { name: "PlayStation 4" }], involved_companies: [{ developer: true, company: { name: "Mobius Digital" } }] },
    { id: 7346, name: "Breath of the Wild", first_release_date: 1488499200, platforms: [{ name: "Nintendo Switch" }], involved_companies: [{ developer: true, company: { name: "Nintendo EPD" } }] },
  ]);
  if (path === "/stub/igdb/v4/game_time_to_beats") return json([{ normally: 22 * 3600 }]);
  // One catalogue slow, the other quick, as Open Library and Google often are.
  if (q.includes("tortoise")) {
    if (url.pathname.endsWith("/search.json")) return void setTimeout(() => json({ docs: [{ key: "/works/OL7W", title: "The Tortoise Arrives", author_name: ["Slow Writer"] }] }), 2500);
    if (url.pathname.includes("/books/v1/volumes")) return json({ items: [{ id: "hare1", volumeInfo: { title: "The Hare Was Here", authors: ["Quick Writer"] } }] });
  }
  if (url.pathname.endsWith("/search.json")) {
    // Availability: The Left Hand of Darkness can be borrowed, Kindred read free.
    if (q === "key:/works/ol1w") return json({ docs: [{ key: "/works/OL1W", ebook_access: "borrowable", lending_edition_s: "OL5M" }] });
    if (q === "key:/works/ol2w") return json({ docs: [{ key: "/works/OL2W", ebook_access: "public" }] });
    if (q.startsWith("key:")) return json({ docs: [{ key: q.slice(4).replace("ol", "OL").replace(/w$/, "W"), ebook_access: "no_ebook" }] });
    if (q.includes("outage")) return json({}, 503);
    if (q.includes("monster")) return json({ docs: [1, 2].map((n) => ({ key: "/works/OL9W", title: `Monster, Vol. ${n}`, author_name: ["Naoki Urasawa"], editions: { docs: [{ key: `/books/OL9${n}M`, title: `Monster, Vol. ${n}` }] } })) });
    return json({ docs: WORKS.filter((w) => w[1].toLowerCase().includes(q) || w[2].some((a) => a.toLowerCase().includes(q))).map(([key, title, author_name, first_publish_year, cover_i]) => ({ key: `/works/${key}`, title, author_name, first_publish_year, cover_i })) });
  }
  if (url.pathname.includes("/works/")) return json({ description: "A description from the work record.", subjects: ["Fiction"] });
  if (url.pathname.includes("/books/v1/volumes")) return json({ error: { code: 429 } }, 429);
  return json({}, 404);
}
