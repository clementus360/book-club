import { asIsbn } from "./normalize";

/** Pauses in typing before each kind of search. Our own catalogue is cheap; the public ones are not. */
export const LOCAL_DELAY = 200;
export const PROVIDER_DELAY = 400;
/** At least this long between two searches of the public catalogues. */
export const PROVIDER_GAP = 700;

export const tidy = (raw: string) => raw.normalize("NFC").replace(/\s+/g, " ").trim();
export const cacheKey = (raw: string) => tidy(raw).toLowerCase();

const IDEOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Is there enough here to be worth asking the public catalogues without being told to? */
export function worthSearching(raw: string): boolean {
  const q = tidy(raw);
  // Two characters can be a whole title in Chinese, Japanese or Korean.
  if ([...q].length < (IDEOGRAPHIC.test(q) ? 2 : 3)) return false;
  // Wait for a whole ISBN rather than search each digit on the way. Titles that
  // are numbers ("1984", "2666") are shorter than this.
  if (/^[\d\s-]+X?$/i.test(q) && q.replace(/\D/g, "").length >= 5) return asIsbn(q) !== null;
  return true;
}
