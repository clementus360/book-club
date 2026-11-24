import "server-only";
import { cookies } from "next/headers";

/**
 * Which look to show. "brand" is the CommonPlace identity (Poppins, navy and
 * orange); "classic" is the earlier serif look. THEME sets the default for
 * everyone; anyone can try the other from Your account, or by visiting
 * /theme/classic or /theme/brand, which remembers it in a cookie.
 */
export const THEMES = ["brand", "classic"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

export function defaultTheme(): Theme {
  return isTheme(process.env.THEME) ? process.env.THEME : "brand";
}

export async function currentTheme(): Promise<Theme> {
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(chosen) ? chosen : defaultTheme();
}
