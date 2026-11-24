// Where pictures may come from. Shared by the server (which checks covers it
// fetched), the browser (which picks the address to load) and the page's CSP.

/** The providers' own image hosts. Loaded directly: they only ever see a cover being fetched. */
export const COVER_HOSTS = [
  "covers.openlibrary.org", "books.google.com", "books.googleusercontent.com", "*.googleusercontent.com",
  "image.tmdb.org", "static.tvmaze.com", "*.anilist.co", "images.igdb.com", "media.rawg.io",
  // Open Library's covers redirect to the Internet Archive, which redirects to one of its servers.
  "archive.org", "*.archive.org",
] as const;

const COVER_HOST = /^(covers\.openlibrary\.org|books\.google\.com|books\.googleusercontent\.com|lh\d\.googleusercontent\.com|image\.tmdb\.org|static\.tvmaze\.com|s\d\.anilist\.co|images\.igdb\.com|media\.rawg\.io)$/;

export function isCoverHost(hostname: string): boolean {
  return COVER_HOST.test(hostname);
}

/**
 * The address to show an image from. A picture someone pasted in (a manual
 * cover, a club's image) is fetched through our server, so the site it is on
 * never learns who is looking at it.
 */
export function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("blob:") || url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && isCoverHost(u.hostname)) return url;
    if (u.protocol !== "https:") return null;
    return `/api/image?u=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}
