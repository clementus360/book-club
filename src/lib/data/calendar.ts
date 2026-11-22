import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { secretKey, siteUrl } from "@/lib/env";
import { requireUser } from "@/lib/viewer";

// The link is worked out from this server's secret each time, so it can be shown
// again although it is stored nowhere.
const tokenFor = (userId: string, nonce: string) =>
  createHmac("sha256", createHmac("sha256", secretKey()).update("commonplace:calendar-link").digest()).update(`${userId}:${nonce}`).digest("base64url");
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hasCalendarLink(): Promise<boolean> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from("calendar_links").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** The reader's own private calendar address, made the first time it is wanted. */
export async function calendarLink(): Promise<string> {
  const { supabase, userId } = await requireUser();
  const find = () => supabase.from("calendar_links").select("nonce, token_hash").eq("user_id", userId).maybeSingle();
  let { data, error } = await find();
  if (!error && !data) {
    const nonce = randomUUID();
    const made = await supabase.from("calendar_links").insert({ user_id: userId, nonce, token_hash: hashOf(tokenFor(userId, nonce)) });
    if (made.error && made.error.code !== "23505") throw new Error(made.error.message); // 23505: another tab got there first
    ({ data, error } = await find());
  }
  if (error || !data) throw new Error(error?.message ?? "No calendar link.");
  const token = tokenFor(userId, data.nonce);
  // Only differs if the server's secret has been replaced since.
  if (data.token_hash !== hashOf(token)) {
    const fixed = await supabase.from("calendar_links").update({ token_hash: hashOf(token) }).eq("user_id", userId);
    if (fixed.error) throw new Error(fixed.error.message);
  }
  return `${siteUrl()}/calendar/${token}.ics`;
}
