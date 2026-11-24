import Link from "next/link";
import { Shell } from "@/components/shell";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export default async function NotFound() {
  // Signed-out visitors would only be sent from /app to the sign-in page.
  const { data } = await (await createClient()).auth.getClaims();
  const signedIn = Boolean(data?.claims);
  return (
    <Shell title="This page is missing" lede={signedIn ? "It may have moved, or it may belong to a club you are not in." : "It may have moved, or you may need to sign in to see it."}>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <Link href="/app" className="btn btn-primary">Back to {BRAND.name}</Link>
        ) : (
          <>
            <Link href="/" className="btn btn-primary">Go to the homepage</Link>
            <Link href="/login" className="btn btn-plain">Sign in</Link>
          </>
        )}
      </div>
    </Shell>
  );
}
