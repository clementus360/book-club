import "server-only";
import { emailFrom, resendKey, siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { compose, type EmailItem } from "./compose";
import { stopUrl } from "./stop";

const API = () => process.env.RESEND_API_URL ?? "https://api.resend.com";

/**
 * Sends whatever email is owed, a batch at a time. Safe to run twice at once:
 * each email is handed out to one run, and Resend ignores a repeat of the
 * same idempotency key for a day.
 */
export async function sendPendingEmail(): Promise<{ sent: number; failed: number }> {
  const key = resendKey(), from = emailFrom();
  if (!key || !from) return { sent: 0, failed: 0 }; // not set up: owed email waits, then expires after two days
  const db = createAdminClient();
  let sent = 0, failed = 0;
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc("claim_emails", { p_limit: 20 });
    if (error) throw new Error(error.message);
    const items = data as unknown as EmailItem[];
    if (!items.length) break;
    const ok: string[] = [];
    const bad: Record<string, string> = {};
    for (const item of items) {
      const stop = stopUrl(item.user_id);
      const email = compose(item, siteUrl(), stop);
      if (!email) { ok.push(item.id); continue; } // nothing left worth saying
      try {
        const res = await fetch(`${API()}/emails`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `notification/${item.id}` },
          body: JSON.stringify({
            from, to: [item.email], subject: email.subject, text: email.text, html: email.html,
            headers: { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) { ok.push(item.id); sent++; }
        else { bad[item.id] = `${res.status} ${(await res.text()).slice(0, 300)}`; failed++; }
      } catch (e) {
        bad[item.id] = e instanceof Error ? e.message : String(e);
        failed++;
      }
    }
    const { error: done } = await db.rpc("finish_emails", { p_sent: ok, p_failed: bad });
    if (done) throw new Error(done.message);
    if (Object.keys(bad).length) { console.warn("[commonplace] email not sent:", Object.values(bad)[0]); break; } // try again later
  }
  return { sent, failed };
}
