import type { Metadata } from "next";
import { NotFoundContent } from "@/components/NotFoundContent";

export const metadata: Metadata = {
  title: "Page not found — Uxio",
  description: "This page doesn't exist. Head back to analyze your landing page.",
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundContent />;
}
