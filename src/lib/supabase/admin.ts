import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { secretKey, supabaseUrl } from "@/lib/env";

/**
 * Bypasses RLS. Used only for import_book() (src/lib/books/import.ts) and for
 * email: handing out what is owed and turning it off from a signed link.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
