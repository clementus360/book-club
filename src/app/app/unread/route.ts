import { NextResponse } from "next/server";
import { requireUser } from "@/lib/viewer";

/** How many notifications the reader has not read, for the mark in the menu. */
export async function GET() {
  const { supabase, userId } = await requireUser();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return NextResponse.json(error ? {} : { unread: count ?? 0 }, { status: error ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
