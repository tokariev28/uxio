import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uxio — AI Competitive Landing Page Analyzer",
  description:
    "Get instant, evidence-based competitive design intelligence for your SaaS landing page.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
