import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { leaderOptions, MeetingForm } from "@/components/meeting-form";
import { PageHeader } from "@/components/ui";
import { createMeeting } from "@/lib/actions/meetings";
import { getActiveCycle, getMeetings, getMembers } from "@/lib/data/club";
import { must, requireClub } from "@/lib/viewer";

export const metadata: Metadata = { title: "Arrange a meeting" };

export default async function NewMeeting() {
  const { supabase, club, isAdmin } = await requireClub();
  if (!isAdmin) redirect("/app/meetings");
  const [members, meetings, active, cycles] = await Promise.all([
    getMembers(), getMeetings(), getActiveCycle(),
    supabase.from("reading_cycles").select("id, number, book:books!reading_cycles_book_id_fkey(title)").eq("club_id", club.id).neq("status", "cancelled").order("number", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader kicker={club.name} title="Arrange a meeting">A title and a date are enough to start. Everyone in the club will be told.</PageHeader>
      <MeetingForm action={createMeeting} hidden={{ club_id: club.id }} leaders={leaderOptions(members, meetings)} zone={club.timezone} kind={club.kind} defaultCycle={active?.id}
        cycles={must(cycles).map((c) => ({ id: c.id, number: c.number, title: c.book?.title ?? null }))} submit="Arrange the meeting" />
    </>
  );
}
