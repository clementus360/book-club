"use server";

import { revalidatePath } from "next/cache";
import { done, explain, failed, type ActionState } from "@/lib/action";
import { calendarLink } from "@/lib/data/calendar";
import { requireUser } from "@/lib/viewer";

export type LinkState = ActionState & { link?: string };

export async function showCalendarLink(): Promise<LinkState> {
  try {
    const link = await calendarLink();
    revalidatePath("/app/calendar");
    return { ...done(), link };
  } catch (error) {
    console.error("[commonplace]", error instanceof Error ? error.message : error);
    return failed("Your link could not be made. Please try again.");
  }
}

export async function turnOffCalendarLink(): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("calendar_links").delete().eq("user_id", userId);
  if (error) return failed(explain(error));
  revalidatePath("/app/calendar");
  return done("Your link is off. Calendars that used it will stop updating.");
}
