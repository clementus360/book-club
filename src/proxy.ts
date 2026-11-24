import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { COVER_HOSTS } from "@/lib/images";

/**
 * Scripts run only if this request's nonce is on them (Next.js adds it to its
 * own), so injected markup cannot run script. Pictures load only from the
 * providers, our storage and Google; anything pasted in goes through /api/image.
 */
function contentSecurityPolicy(nonce: string, https: boolean): string {
  const dev = process.env.NODE_ENV === "development";
  const storage = new URL(supabaseUrl()).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React's style attributes cannot carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${storage} ${COVER_HOSTS.map((h) => `https://${h}`).join(" ")}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    // Only where the site itself is https: on plain http it would break every request.
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Refreshes the session and turns signed-out visitors away from private pages. */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request.nextUrl.protocol === "https:");
  // Next.js reads the nonce from the request's policy while rendering.
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Must run before any response is returned: it verifies and refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const go = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  const isPrivate = pathname === "/app" || pathname.startsWith("/app/") || pathname === "/onboarding";
  if (isPrivate && !signedIn) return go(`/login?next=${encodeURIComponent(pathname + search)}`);
  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next") ?? "";
    return go(/^\/(app|invite)(\/|$|\?)/.test(next) ? next : "/app");
  }
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
