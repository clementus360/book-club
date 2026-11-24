import "server-only";
import { emailFrom, resendKey, siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { compose, type EmailItem } from "./compose";
import { stopUrl } from "./stop";

const API = () => process.env.RESEND_API_URL || "https://api.resend.com";

// Resend allows a few requests a second, and on the free plan 100 emails a day.
// Sending one at a time with a pause stays under the first. When either limit is
// reached, what is left goes back to the outbox uncounted and waits for the
// next run (email waits up to two days before it is given up on).
const PAUSE_MS = 550;
const BUDGET_MS = 45_000; // the route may run for 60 seconds
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends whatever email is owed, a batch at a time. Safe to run twice at once:
 * each email is handed out to one run, and Resend ignores a repeat of the
 * same idempotency key for a day.
 */
export async function sendPendingEmail(): Promise<{ sent: number; failed: number; deferred: number }> {
  const key = resendKey(), from = emailFrom();
  if (!key || !from) return { sent: 0, failed: 0, deferred: 0 }; // not set up: owed email waits, then expires after two days
  const db = createAdminClient();
  const started = Date.now();
  let sent = 0, failed = 0, deferred = 0;
  let stop = false;
  while (!stop && Date.now() - started < BUDGET_MS) {
    const { data, error } = await db.rpc("claim_emails", { p_limit: 20 });
    if (error) throw new Error(error.message);
    const items = data as unknown as EmailItem[];
    if (!items.length) break;
    const ok: string[] = [];
    const bad: Record<string, string> = {};
    const later: string[] = [];
    for (const item of items) {
      if (stop || Date.now() - started >= BUDGET_MS) { later.push(item.id); continue; }
      const unsubscribe = stopUrl(item.user_id);
      const email = compose(item, siteUrl(), unsubscribe);
      if (!email) { ok.push(item.id); continue; } // nothing left worth saying
      const post = () => fetch(`${API()}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `notification/${item.id}` },
        body: JSON.stringify({
          from, to: [item.email], subject: email.subject, text: email.text, html: email.html,
          headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      try {
        let res = await post();
        if (res.status === 429) {
          const body = await res.text();
          // Too fast: wait as asked, once. A daily or monthly quota: stop until the next run.
          if (/rate_limit/.test(body)) {
            await sleep(Math.min(Number(res.headers.get("retry-after") ?? 1), 5) * 1000);
            res = await post();
          } else res = new Response(body, { status: 429 });
          if (res.status === 429) {
            console.warn("[commonplace] email limit reached; the rest will be sent later:", (await res.text()).slice(0, 200));
            later.push(item.id);
            stop = true;
            continue;
          }
        }
        if (res.ok) { ok.push(item.id); sent++; }
        else { bad[item.id] = `${res.status} ${(await res.text()).slice(0, 300)}`; failed++; }
      } catch (e) {
        bad[item.id] = e instanceof Error ? e.message : String(e);
        failed++;
      }
      await sleep(PAUSE_MS);
    }
    const { error: done } = await db.rpc("finish_emails", { p_sent: ok, p_failed: bad });
    if (done) throw new Error(done.message);
    if (later.length) {
      deferred += later.length;
      const { error: back } = await db.rpc("release_emails", { p_ids: later });
      if (back) throw new Error(back.message);
    }
    if (Object.keys(bad).length) { console.warn("[commonplace] email not sent:", Object.values(bad)[0]); break; } // try again later
  }
  return { sent, failed, deferred };
}
