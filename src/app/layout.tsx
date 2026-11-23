import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Literata } from "next/font/google";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const literata = Literata({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-literata", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Commonplace: Good stories. Better conversations.", template: "%s · Commonplace" },
  description: "A private place for a book, film, TV, anime or game club to choose together, enjoy it together, and keep a record of the conversation.",
};

export const viewport: Viewport = { themeColor: "#f1eee6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${literata.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
