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
  icons: {
    icon: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
    url: "https://uxio-wheat.vercel.app",
    siteName: "Uxio",
    images: [
      {
        url: "https://uxio-wheat.vercel.app/og.png",
        width: 1200,
        height: 630,
        alt: "Uxio — See your landing page through your competitor's eyes",
        type: "image/png",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Uxio — AI Competitive Landing Page Analyzer",
    description:
      "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
    images: [{ url: "https://uxio-wheat.vercel.app/og.png", alt: "Uxio — See your landing page through your competitor's eyes" }],
  },
};

// Static compile-time constant — not user input, safe for dangerouslySetInnerHTML
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Uxio",
  description:
    "AI-powered competitive landing page analyzer. Submit any public SaaS URL — Uxio runs a 7-agent pipeline that identifies your 3 closest true competitors, scores 12 page sections on a 10-axis rubric, and returns prioritized, evidence-backed recommendations in 2–4 minutes.",
  url: "https://uxio-wheat.vercel.app",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
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
    "12 SaaS section types detected (hero, features, pricing, testimonials, CTA, and more)",
    "Real-time progress streaming via SSE",
    "PDF export of the full analysis report",
    "5-signal quality gate before result delivery",
    "2-hour result cache — revisit the same URL instantly",
  ],
  screenshot: "https://uxio-wheat.vercel.app/og.png",
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
