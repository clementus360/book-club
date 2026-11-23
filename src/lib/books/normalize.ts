import type { BookFormat } from "./types";

/** For comparing, never for display. Keeps every script; drops case, width and punctuation. */
export function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").normalize("NFKC").toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const clean = (raw: string) => raw.replace(/[\s-]/g, "").toUpperCase();

export function isValidIsbn10(raw: string): boolean {
  const s = clean(raw);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  const sum = [...s].reduce((n, c, i) => n + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

export function isValidIsbn13(raw: string): boolean {
  const s = clean(raw);
  if (!/^97[89]\d{10}$/.test(s)) return false;
  return [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}

export function isbn10to13(raw: string): string | null {
  if (!isValidIsbn10(raw)) return null;
  const body = `978${clean(raw).slice(0, 9)}`;
  const sum = [...body].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

export function pickIsbns(all: readonly string[] | undefined): { isbn_10: string | null; isbn_13: string | null } {
  const list = (all ?? []).map(clean);
  const isbn_10 = list.find(isValidIsbn10) ?? null;
  const isbn_13 = list.find(isValidIsbn13) ?? (isbn_10 ? isbn10to13(isbn_10) : null);
  return { isbn_10, isbn_13 };
}

/** The query as an ISBN, if that is what it is. */
export function asIsbn(query: string): string | null {
  const s = clean(query);
  return isValidIsbn10(s) || isValidIsbn13(s) ? s : null;
}

const LANGUAGES: Record<string, string> = {
  eng: "en", fre: "fr", fra: "fr", ger: "de", deu: "de", spa: "es", por: "pt", ita: "it", dut: "nl", nld: "nl",
  jpn: "ja", chi: "zh", zho: "zh", kor: "ko", rus: "ru", ara: "ar", hin: "hi", ben: "bn", urd: "ur", per: "fa",
  fas: "fa", tur: "tr", pol: "pl", swe: "sv", nor: "no", dan: "da", fin: "fi", gre: "el", ell: "el", heb: "he",
  cze: "cs", ces: "cs", hun: "hu", rum: "ro", ron: "ro", ukr: "uk", vie: "vi", tha: "th", ind: "id", may: "ms",
  msa: "ms", swa: "sw", kin: "rw", amh: "am", yor: "yo", ibo: "ig", hau: "ha", zul: "zu", xho: "xh", afr: "af",
  cat: "ca", baq: "eu", eus: "eu", glg: "gl", srp: "sr", hrv: "hr", bul: "bg", ice: "is", isl: "is", lat: "la",
  tam: "ta", tel: "te", mal: "ml", mar: "mr", lin: "ln", som: "so", wol: "wo",
};

/** ISO 639-1 where one exists. Open Library uses MARC codes, Google uses BCP 47. */
export function normalizeLanguage(code: string | null | undefined): string | null {
  const s = code?.trim().toLowerCase().split("-")[0];
  if (!s || s === "und" || s === "mul") return null;
  if (s.length === 2) return s;
  return LANGUAGES[s] ?? (/^[a-z]{3}$/.test(s) ? s : null);
}

export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const FULLWIDTH = /[０-９]/g;
const digits = (s: string) => s.replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/^0+(?=\d)/, "");

/**
 * Finds an explicit volume marker in a title. Only unmistakable markers count:
 * a bare trailing number ("Catch-22", "1984", "Fahrenheit 451") is not one.
 */
export function parseVolume(title: string): { series: string; volume: string } | null {
  const patterns: RegExp[] = [
    /^(?<s>.+?)[\s,:;.\-–—(\[]*\b(?:vol(?:ume)?s?\.?|book|tome|band|tomo|bd\.?)\s*(?<n>\d+(?:\.\d+)?)\b/iu,
    /^(?<s>.+?)[\s,:(]*#\s*(?<n>\d+(?:\.\d+)?)/u,
    /^(?<s>.+?)[\s,:(（]*第\s*(?<n>[0-9０-９]+)\s*[巻卷集冊册話]/u,
    /^(?<s>.+?)[\s,:(（]*(?<n>[0-9０-９]+)\s*[巻卷]/u,
    /^(?<s>.+?)[\s,:(（]*제?\s*(?<n>[0-9]+)\s*권/u,
    /^(?<s>.+?)[\s,:.]*[（(](?<n>[0-9０-９]{1,3})[)）]\s*$/u,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    const series = m?.groups?.s?.replace(/[\s,:;.\-–—(\[]+$/u, "").trim();
    if (m?.groups?.n && series) return { series, volume: digits(m.groups.n) };
  }
  // Japanese two- and three-part novels: 上 / 中 / 下.
  const part = title.match(/^(?<s>.+?)[\s.,:（(]+(?<n>[上中下])[)）]?(?:巻)?\s*$/u);
  if (part?.groups?.s && part.groups.n) return { series: part.groups.s.trim(), volume: part.groups.n };
  // The Korean equivalents, 상 / 중 / 하, only where set off by punctuation.
  const korean = title.match(/^(?<s>.+?)\s*[-–.,(]\s*(?<n>[상중하])\)?(?:권)?\s*$/u);
  if (korean?.groups?.s && korean.groups.n) return { series: korean.groups.s.trim(), volume: korean.groups.n };
  return null;
}

/** Conservative: says nothing rather than guess. Order matters. */
export function inferFormat(subjects: readonly string[]): BookFormat | null {
  const s = subjects.join(" | ").toLowerCase();
  if (!s) return null;
  if (/\blight novels?\b/.test(s)) return "light_novel";
  if (/\bmanhwa\b/.test(s)) return "manhwa";
  if (/\bmanhua\b/.test(s)) return "manhua";
  if (/\bmanga\b/.test(s)) return "manga";
  if (/\bgraphic novels?\b/.test(s)) return "graphic_novel";
  if (/\bcomic(s| books?)\b/.test(s)) return "comic";
  return null;
}

export function yearOf(date: string | null | undefined): number | null {
  const m = date?.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return m ? Number(m[1]) : null;
}

/** Plain text from provider descriptions, some of which contain HTML. */
export function plainText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<\s*(br|\/p)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, 10_000) : null;
}

const COVER_HOSTS = /^(covers\.openlibrary\.org|books\.google\.com|books\.googleusercontent\.com|lh\d\.googleusercontent\.com|image\.tmdb\.org|static\.tvmaze\.com|s\d\.anilist\.co|images\.igdb\.com|media\.rawg\.io)$/;

/** https only, and only from the providers' own image hosts. */
export function trustedCover(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:" || !COVER_HOSTS.test(u.hostname)) return null;
    u.searchParams.delete("edge");
    return u.toString();
  } catch {
    return null;
  }
}
