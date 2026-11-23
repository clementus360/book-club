// Everything here is read on the server only. Nothing needs NEXT_PUBLIC_, which
// would copy a value into the browser if any client code ever referred to it.
// The prefixed names are still accepted for projects set up with them.

function required(name: string, ...values: (string | undefined)[]): string {
  const value = values.find(Boolean);
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

export const supabaseUrl = () => required("SUPABASE_URL", process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseKey = () =>
  required(
    "SUPABASE_PUBLISHABLE_KEY",
    process.env.SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

/** Supabase's secret key (sb_secret_...). Older projects call it the service_role key. Never prefix this one. */
export const secretKey = () => required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** On only once Google is set up in Supabase, so nobody meets a button that fails. */
export const googleAuth = () => (process.env.GOOGLE_AUTH || process.env.NEXT_PUBLIC_GOOGLE_AUTH) === "1";

/** Resend, for email about milestones. Without both, nothing is emailed. Server only. */
export const resendKey = () => process.env.RESEND_API_KEY || null;
/** For example: Commonplace <club@mail.example.com>, on a domain verified in Resend. */
export const emailFrom = () => process.env.EMAIL_FROM || null;

export const contactEmail = () => process.env.CONTACT_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;

/** Taken from configuration, never from the Host header, because it ends up in emails. */
export function siteUrl(): string {
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
