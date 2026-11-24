import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Literata, Poppins } from "next/font/google";
import { connection } from "next/server";
import { siteUrl } from "@/lib/env";
import { currentTheme } from "@/lib/theme";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const literata = Literata({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-literata", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-hanken", display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en" },
};

export const viewport: Viewport = { themeColor: BRAND.colors.paper, width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered for its request, so it can carry that request's
  // script nonce (see src/proxy.ts). Static pages could not.
  await connection();
  const theme = await currentTheme();
  return (
    <html lang="en" data-theme={theme} className={`${poppins.variable} ${literata.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
