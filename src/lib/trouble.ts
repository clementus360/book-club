import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";

/**
 * What to tell someone when a server action throws instead of answering.
 *
 * The usual cause is a new deployment: a page opened before it still holds the
 * old action IDs, so its first save is rejected. Reloading fetches the new
 * ones, so that is done once, keeping what was typed (see `keepForReload`).
 * Redirects and not-found are not failures and are passed back to Next.js.
 */
export function trouble(error: unknown, form?: HTMLFormElement | null): { ok: false; message: string; at: number } {
  unstable_rethrow(error);
  const at = Date.now();
  if (unstable_isUnrecognizedActionError(error)) {
    if (keepForReload(form)) {
      window.location.reload();
      return { ok: false, message: "Commonplace has just been updated. Reloading the page…", at };
    }
    return { ok: false, message: "Commonplace has just been updated. Please reload the page and try again.", at };
  }
  // A dropped connection, or a request cut short by leaving the page: nothing to log.
  if (error instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { ok: false, message: "Commonplace could not be reached. Check your connection and try again.", at };
  }
  console.error("[commonplace] action failed", error);
  const digest = (error as { digest?: unknown } | null)?.digest;
  return { ok: false, message: `That did not save. Please try again.${typeof digest === "string" ? ` (Reference: ${digest})` : ""}`, at };
}

const KEY = "commonplace:after-update";
const FRESH = 10 * 60_000;
type Kept = { path: string; fields: string; values: [string, string][]; at: number };

/** The names of a form's fields, so a reloaded page puts words back into the same form. */
export const fieldsOf = (form: HTMLFormElement) =>
  Array.from(form.elements).flatMap((e) => ("name" in e && typeof e.name === "string" && e.name && !(e instanceof HTMLButtonElement) ? [e.name] : [])).sort().join(" ");

/** Remembers the form for one reload. False if the page was already reloaded for this, to avoid a loop. */
function keepForReload(form?: HTMLFormElement | null): boolean {
  try {
    const before = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Kept | null;
    if (before && before.path === location.pathname && Date.now() - before.at < 30_000) return false;
    const values = form ? Array.from(new FormData(form)).flatMap(([k, v]): [string, string][] => (typeof v === "string" ? [[k, v]] : [])) : [];
    sessionStorage.setItem(KEY, JSON.stringify({ path: location.pathname, fields: form ? fieldsOf(form) : "", values, at: Date.now() } satisfies Kept));
    return true;
  } catch {
    return false;
  }
}

/** After that reload: the words for this form, once. */
export function takeKept(form: HTMLFormElement): FormData | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Kept | null;
    if (!kept || kept.path !== location.pathname || Date.now() - kept.at > FRESH || !kept.values.length || kept.fields !== fieldsOf(form)) return null;
    sessionStorage.removeItem(KEY);
    const data = new FormData();
    for (const [k, v] of kept.values) data.append(k, v);
    return data;
  } catch {
    return null;
  }
}
