import { fold } from "./normalize";
import type { BookRecord } from "./types";

const same = (a: string | null, b: string | null) => a !== null && a === b;

/** True only when two records are certainly the same publication. */
export function isSamePublication(a: BookRecord, b: BookRecord): boolean {
  if (a.volume_number && b.volume_number && fold(a.volume_number) !== fold(b.volume_number)) return false;
  return (
    same(a.google_books_id, b.google_books_id) ||
    same(a.open_library_edition_id, b.open_library_edition_id) ||
    same(a.isbn_13, b.isbn_13) ||
    same(a.isbn_10, b.isbn_10)
  );
}

/** Keeps `a`, filling its gaps from `b`. */
export function fillGaps(a: BookRecord, b: BookRecord): BookRecord {
  const out = { ...a } as Record<string, unknown>;
  for (const [key, value] of Object.entries(b)) {
    const mine = out[key];
    if (mine === null || (Array.isArray(mine) && mine.length === 0)) out[key] = value;
  }
  return out as BookRecord;
}

/** Interleaves providers so neither crowds the other out, merging only certain duplicates. */
export function mergeResults(primary: BookRecord[], secondary: BookRecord[], limit = 16): BookRecord[] {
  const out: BookRecord[] = [];
  const add = (record: BookRecord) => {
    const i = out.findIndex((o) => isSamePublication(o, record));
    if (i >= 0) out[i] = fillGaps(out[i]!, record);
    else out.push(record);
  };
  for (let i = 0; i < Math.max(primary.length, secondary.length); i++) {
    if (primary[i]) add(primary[i]!);
    if (secondary[i]) add(secondary[i]!);
  }
  return out.slice(0, limit);
}
