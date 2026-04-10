import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  style: ["italic"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://uxio-wheat.vercel.app"),
  title: "Uxio — AI Competitive Landing Page Analyzer",
  description:
    "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
    url: "https://uxio-wheat.vercel.app",
    siteName: "Uxio",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Uxio — See your landing page through your competitor's eyes",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${instrumentSerif.variable}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
