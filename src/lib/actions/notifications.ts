"use server";

import { revalidatePath } from "next/cache";
import { done, explain, failed, isUuid, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/viewer";

const NOT_SAVED = "That could not be saved. Please try again.";

export async function markNotificationRead(id: string): Promise<ActionState> {
  if (!isUuid(id)) return failed(NOT_SAVED);
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).is("read_at", null);
  if (error) return failed(explain(error, NOT_SAVED));
  revalidatePath("/app", "layout");
  return done();
}

/** Everything up to the newest one the reader could see, so later arrivals stay unread. */
export async function markAllNotificationsRead(before: string): Promise<ActionState> {
  if (typeof before !== "string" || Number.isNaN(Date.parse(before))) return failed(NOT_SAVED);
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", userId).is("read_at", null).lt("created_at", new Date(before).toISOString());
  if (error) return failed(explain(error, NOT_SAVED));
  revalidatePath("/app", "layout");
  return done();
}
