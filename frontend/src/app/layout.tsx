import type { Metadata } from "next";
import { Inter_Tight, Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SilentSpeak AI — Communication Beyond Voice",
  description: "Visual speech recognition, on the edge. No microphone. No cloud. No noise.",
  metadataBase: new URL(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  ),
  openGraph: {
    title: "SilentSpeak AI — Communication Beyond Voice",
    description: "Visual speech recognition, on the edge. No microphone. No cloud. No noise.",
    type: "website",
    siteName: "SilentSpeak AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "SilentSpeak AI",
    description: "Visual speech recognition, on the edge. No microphone. No cloud. No noise.",
  },
  robots: { index: true, follow: true },
};

import Providers from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
      style={{
        ["--font-display" as string]: "var(--font-inter-tight), -apple-system, system-ui, sans-serif",
        ["--font-body" as string]: "var(--font-inter), -apple-system, system-ui, sans-serif",
        ["--font-mono" as string]: "var(--font-jetbrains-mono), ui-monospace, monospace",
      }}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
