import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { leaderOptions, MeetingForm } from "@/components/meeting-form";
import { PageHeader } from "@/components/ui";
import { isUuid } from "@/lib/action";
import { updateMeeting } from "@/lib/actions/meetings";
import { getMeetings, getMembers } from "@/lib/data/club";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Edit meeting" };

export default async function EditMeeting({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, club, isAdmin } = await requireClub();
  if (!isUuid(id)) notFound();
  if (!isAdmin) redirect(`/app/meetings/${id}`);
  const [members, meetings, cycles] = await Promise.all([
    getMembers(), getMeetings(),
    supabase.from("reading_cycles").select("id, number, book:books!reading_cycles_book_id_fkey(title)").eq("club_id", club.id).neq("status", "cancelled").order("number", { ascending: false }),
  ]);
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) notFound();
  return (
    <>
      <PageHeader kicker={club.name} title="Edit meeting" />
      <MeetingForm action={updateMeeting} hidden={{ meeting_id: id }} meeting={meeting} leaders={leaderOptions(members, meetings)} zone={club.timezone}
        cycles={must(cycles).map((c) => ({ id: c.id, number: c.number, title: c.book?.title ?? null }))} submit="Save changes" />
    </>
  );
}
