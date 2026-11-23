"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { done, explain, failed, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/viewer";

const BUCKET = "avatars";
const MAX_BYTES = 200 * 1024;
const GOOGLE = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/\S+$/;

/** What the file really is, from its first bytes, whatever it claims to be. */
function kindOf(bytes: Uint8Array): { type: string; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { type: "image/png", ext: "png" };
  return null;
}

/** The person's own uploaded file behind a picture address, if it is one. */
function ownFile(url: string | null, userId: string): string | null {
  const m = url?.match(new RegExp(`/storage/v1/object/public/${BUCKET}/(${userId}/[\\w-]+\\.(?:webp|jpg|png))$`));
  return m?.[1] ?? null;
}

async function setPicture(url: string | null): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const { data: before } = await supabase.from("profiles").select("avatar_url").eq("id", userId).single();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (error) return failed(explain(error));
  // The old upload is no longer shown anywhere. Failing to tidy it is harmless.
  const old = ownFile(before?.avatar_url ?? null, userId);
  if (old && old !== ownFile(url, userId)) {
    const { error: gone } = await supabase.storage.from(BUCKET).remove([old]);
    if (gone) console.warn("[commonplace] old picture not removed:", gone.message);
  }
  revalidatePath("/app", "layout");
  return done(url ? "Picture saved." : "Picture removed.");
}

/** A picture already shrunk to a small square by the browser. */
export async function uploadPicture(form: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const file = form.get("picture");
  if (!(file instanceof Blob) || file.size === 0) return failed("Choose a picture.");
  if (file.size > MAX_BYTES) return failed("That picture is too large. Please try another.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = kindOf(bytes);
  if (!kind) return failed("That does not look like a picture. Try a JPEG, PNG or WebP image.");
  const path = `${userId}/${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[commonplace] picture upload:", error.message);
    return failed("The picture could not be saved. Please try again in a moment.");
  }
  return setPicture(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
}

/** The picture Google gave when the person signed in with it. */
export async function chooseGooglePicture(): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const url = [meta.avatar_url, meta.picture].find((u): u is string => typeof u === "string" && GOOGLE.test(u));
  if (!url) return failed("There is no Google picture to use. Sign in with Google first, or upload one.");
  return setPicture(url);
}

export async function removePicture(): Promise<ActionState> {
  return setPicture(null);
}
