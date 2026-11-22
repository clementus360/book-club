import type { Metadata } from "next";
import { Notifications } from "@/components/notifications";
import { getNotifications } from "@/lib/data/notifications";

export const metadata: Metadata = { title: "Notifications" };

const STEP = 50, MOST = 500;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const asked = Number((await searchParams).show);
  const show = Number.isInteger(asked) ? Math.min(MOST, Math.max(STEP, asked)) : STEP;
  const { notices, unread, more, before } = await getNotifications(show);
  return <Notifications notices={notices} unread={unread} before={before} older={more && show < MOST ? `/app/notifications?show=${show + STEP}` : null} />;
}
