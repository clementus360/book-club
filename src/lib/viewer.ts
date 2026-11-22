import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Enums, Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export const CLUB_COOKIE = "commonplace_club";

export type ViewerClub = Tables<"clubs"> & { role: Enums<"club_role"> };

/** The signed-in reader, verified, or a trip to the sign-in page. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub, email: (data.claims.email as string | undefined) ?? "" };
});

export const getViewer = cache(async () => {
  const { supabase, userId, email } = await requireUser();
  const [profile, memberships, unread] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("club_memberships").select("role, joined_at, club:clubs!club_memberships_club_id_fkey(*)").eq("user_id", userId).order("joined_at"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (memberships.error) throw new Error(memberships.error.message);
  if (profile.error) throw new Error(profile.error.message);
  // The account is gone but its token has not expired yet. /login would bounce back here.
  if (!profile.data) redirect("/auth/expired");
  const clubs: ViewerClub[] = memberships.data.flatMap((m) => (m.club ? [{ ...m.club, role: m.role }] : []));
  // The cookie is only a preference: a club the reader does not belong to is ignored.
  const wanted = (await cookies()).get(CLUB_COOKIE)?.value;
  const club = clubs.find((c) => c.id === wanted) ?? clubs[0] ?? null;
  return { supabase, userId, email, profile: profile.data, clubs, club, unread: unread.count ?? 0 };
});

/** For club pages: the selected club, brought up to date with its deadlines. */
export const requireClub = cache(async () => {
  const viewer = await getViewer();
  if (!viewer.club) redirect("/onboarding");
  const { error } = await viewer.supabase.rpc("sync_club", { p_club_id: viewer.club.id });
  if (error) throw new Error(error.message);
  return { ...viewer, club: viewer.club, isAdmin: viewer.club.role === "admin" };
});

/** Throws on query errors so the error boundary, not an empty page, is shown. */
export function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}
