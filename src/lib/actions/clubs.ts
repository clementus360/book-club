"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { done, explain, failed, isUuid, text, type ActionState } from "@/lib/action";
import { isTimeZone } from "@/lib/dates";
import { siteUrl } from "@/lib/env";
import { CLUB_COOKIE, getViewer, requireUser } from "@/lib/viewer";

const refreshApp = () => revalidatePath("/app", "layout");

async function selectClub(id: string) {
  (await cookies()).set(CLUB_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
}

export async function createClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const zone = form.get("timezone");
  const { data, error } = await supabase.rpc("create_club", {
    p_name: text(form, "name") ?? "", p_description: text(form, "description"), p_timezone: isTimeZone(zone) ? zone : "UTC",
  });
  if (error) return failed(explain(error));
  await selectClub(data);
  refreshApp();
  redirect("/app");
}

export async function switchClub(form: FormData): Promise<void> {
  const { clubs } = await getViewer();
  const club = clubs.find((c) => c.id === form.get("club_id"));
  if (club) await selectClub(club.id);
  refreshApp();
  redirect("/app");
}

export type InviteState = ActionState & { link?: string };

export async function createInvitation(_: InviteState | null, form: FormData): Promise<InviteState> {
  const clubId = form.get("club_id");
  if (!isUuid(clubId)) return failed("Choose a club first.");
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_invitation", { p_club_id: clubId });
  if (error || !data?.[0]) return failed(error ? explain(error) : "That invitation could not be made.");
  refreshApp();
  return { ...done(), link: `${siteUrl()}/invite/${data[0].token}` };
}

export async function revokeInvitation(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: String(form.get("id")) });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

const INVITE_PROBLEMS: Record<string, string> = {
  used: "This invitation has already been used.",
  revoked: "This invitation has been withdrawn.",
  expired: "This invitation has expired.",
  invalid: "This invitation link is not valid.",
  rate_limited: "Too many attempts. Please wait a quarter of an hour and try again.",
};

export async function acceptInvitation(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: String(form.get("token") ?? "") });
  if (error) return failed(explain(error));
  const result = data as { status: string; club_id?: string };
  if ((result.status === "joined" || result.status === "already_member") && result.club_id) {
    await selectClub(result.club_id);
    refreshApp();
    redirect("/app");
  }
  return failed(INVITE_PROBLEMS[result.status] ?? "That invitation could not be accepted.");
}

export async function setMemberRole(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const role = form.get("role") === "admin" ? "admin" : "member";
  const { error } = await supabase.rpc("set_member_role", { p_club_id: String(form.get("club_id")), p_user_id: String(form.get("user_id")), p_role: role });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function removeMember(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_member", { p_club_id: String(form.get("club_id")), p_user_id: String(form.get("user_id")) });
  if (error) return failed(explain(error));
  refreshApp();
  return done();
}

export async function leaveClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("leave_club", { p_club_id: String(form.get("club_id")) });
  if (error) return failed(explain(error));
  (await cookies()).delete(CLUB_COOKIE);
  refreshApp();
  redirect("/app");
}

export async function closeClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, clubs } = await getViewer();
  const club = clubs.find((c) => c.id === form.get("club_id"));
  if (!club) return failed("That club could not be found.");
  if (text(form, "confirm") !== club.name) return failed("Type the club's name exactly to confirm.");
  const { error } = await supabase.rpc("close_club", { p_club_id: club.id });
  if (error) return failed(explain(error));
  (await cookies()).delete(CLUB_COOKIE);
  refreshApp();
  redirect("/app");
}

const days = (form: FormData, name: string) => {
  const n = Number(form.get(name));
  return Number.isInteger(n) ? n : NaN;
};

export async function updateClub(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  let changes;
  if (form.get("part") === "lengths") {
    changes = {
      default_nomination_days: days(form, "default_nomination_days"), default_voting_days: days(form, "default_voting_days"),
      default_reading_days: days(form, "default_reading_days"), default_runoff_days: days(form, "default_runoff_days"),
    };
    if (Object.values(changes).some(Number.isNaN)) return failed("Each length should be a whole number of days.");
  } else {
    const zone = form.get("timezone");
    const image = text(form, "image_url");
    const name = text(form, "name");
    if (!name) return failed("A club needs a name.");
    if (!isTimeZone(zone)) return failed("Choose a timezone.");
    if (image && !image.startsWith("https://")) return failed("The image address needs to start with https://");
    changes = { name, description: text(form, "description"), image_url: image, timezone: zone };
  }
  const { data, error } = await supabase.from("clubs").update(changes).eq("id", String(form.get("club_id"))).select("id");
  if (error) return failed(explain(error));
  if (!data.length) return failed("Only a club administrator can do that.");
  refreshApp();
  return done("Club settings saved.");
}

export async function updateProfile(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const name = text(form, "display_name");
  const avatar = text(form, "avatar_url");
  if (!name || name.length > 80) return failed("A name of up to 80 characters is needed.");
  if (avatar && !avatar.startsWith("https://")) return failed("The picture address needs to start with https://");
  const { error } = await supabase.from("profiles").update({ display_name: name, avatar_url: avatar }).eq("id", userId);
  if (error) return failed(explain(error));
  refreshApp();
  return done("Profile saved.");
}


export async function updateEmailUpdates(_: ActionState | null, form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const on = form.get("email_updates") === "on";
  const { error } = await supabase.from("profiles").update({ email_updates: on }).eq("id", userId);
  if (error) return failed(explain(error));
  refreshApp();
  return done(on ? "You will be emailed at important moments." : "Emails are off.");
}
