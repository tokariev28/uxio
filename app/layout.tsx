import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://uxio-wheat.vercel.app"
  ),
  title: "Uxio — AI Competitive Landing Page Analyzer",
  description:
    "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
    url: "/",
    siteName: "Uxio",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://uxio-wheat.vercel.app";

// Static compile-time object built from env vars — not user input
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Uxio",
  description:
    "AI-powered competitive landing page analyzer. Submit any public SaaS URL — Uxio runs a 7-agent pipeline that identifies your 3 closest true competitors, scores 15 page sections on a 10-axis rubric, and returns prioritized, evidence-backed recommendations in 2–4 minutes.",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "en-US",
  datePublished: "2026-04-01",
  dateModified: "2026-04-11",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free to use — no account required",
  },
  featureList: [
    "7-agent AI pipeline (Page Intelligence, Competitor Discovery, Vision Analysis, Synthesis)",
    "Multi-signal competitor discovery via Tavily search and LLM knowledge cross-validation",
    "10-axis scoring rubric across Communication, Conversion, and Visual groups",
    "15 SaaS section types detected (hero, features, pricing, testimonials, CTA, and more)",
    "Real-time progress streaming via SSE",
    "PDF export of the full analysis report",
    "5-signal quality gate before result delivery",
    "2-hour result cache — revisit the same URL instantly",
  ],
  screenshot: `${SITE_URL}/opengraph-image`,
  audience: {
    "@type": "Audience",
    audienceType:
      "SaaS founders, product designers, growth marketers, product managers",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${instrumentSerif.variable}`} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- static compile-time object, not user input */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
