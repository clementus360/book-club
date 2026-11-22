function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

// NEXT_PUBLIC_ variables must be referenced literally to be inlined.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
/** Supabase's secret key (sb_secret_...). Older projects call it the service_role key. */
export const secretKey = () =>
  required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

/** On only once Google is set up in Supabase, so nobody meets a button that fails. */
export const googleAuth = () => process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

/** Taken from configuration, never from the Host header, because it ends up in emails. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
