import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { checkStop } from "@/lib/email/stop";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Stop emails", robots: { index: false } };

// A page with a button rather than an instant change: some mail systems open
// every link in a message to check it, and that must not unsubscribe anyone.
export default async function StopEmails({ searchParams }: { searchParams: Promise<{ u?: string; s?: string; done?: string }> }) {
  const { u, s, done } = await searchParams;
  if (done) return <Shell title="Emails stopped" lede={`You will not get any more emails about your clubs. Everything still shows in ${BRAND.name}, and you can turn emails back on in Your account.`} />;
  if (!checkStop(u, s)) return <Shell title="This link is not valid" lede={<>It may have been copied only in part. You can turn emails off in <Link className="link" href="/app/account">Your account</Link>.</>} />;
  return (
    <Shell title={`Stop emails from ${BRAND.name}?`} lede="You will no longer be emailed when something important happens in your clubs. Notifications in the app carry on.">
      <form method="post" action="/email/stop/now">
        <input type="hidden" name="u" value={u} /><input type="hidden" name="s" value={s} /><input type="hidden" name="page" value="1" />
        <button className="btn btn-primary">Stop these emails</button>
      </form>
    </Shell>
  );
}
