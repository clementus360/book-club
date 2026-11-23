import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { secretKey, siteUrl } from "@/lib/env";

// An unsubscribe link works without signing in, so it carries a signature
// instead. It only ever turns emails off for the person it was sent to.
const sign = (userId: string) =>
  createHmac("sha256", createHmac("sha256", secretKey()).update("commonplace:email-stop").digest()).update(userId).digest("base64url");

export const stopUrl = (userId: string) => `${siteUrl()}/email/stop?${new URLSearchParams({ u: userId, s: sign(userId) })}`;

export function checkStop(userId: unknown, signature: unknown): userId is string {
  if (typeof userId !== "string" || typeof signature !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const [given, expected] = [Buffer.from(signature, "base64url"), Buffer.from(sign(userId), "base64url")];
  return given.length === expected.length && timingSafeEqual(given, expected);
}
