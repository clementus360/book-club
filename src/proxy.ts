import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/** Refreshes the session and turns signed-out visitors away from private pages. */
export async function proxy(request: NextRequest) {
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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
