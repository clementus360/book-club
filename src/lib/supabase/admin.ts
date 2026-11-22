import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { secretKey, supabaseUrl } from "@/lib/env";

/** Bypasses RLS. Only src/lib/books/import.ts uses this, for import_book(). */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
