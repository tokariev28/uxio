import type { SectionType, Priority } from "@/lib/types/analysis";

// ── Section type constants ───────────────────────────────────────────────────

/** All valid section types recognized by the pipeline. */
export const VALID_SECTION_TYPES = new Set<SectionType>([
  "hero",
  "navigation",
  "features",
  "benefits",
  "socialProof",
  "testimonials",
  "integrations",
  "howItWorks",
  "pricing",
  "faq",
  "cta",
  "footer",
  "videoDemo",
  "comparison",
  "metrics",
]);

/** Human-readable labels for each section type. */
export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  navigation: "Navigation",
  features: "Features",
  benefits: "Benefits",
  socialProof: "Social Proof",
  testimonials: "Testimonials",
  integrations: "Integrations",
  howItWorks: "How It Works",
  pricing: "Pricing",
  faq: "FAQ",
  cta: "Call to Action",
  footer: "Footer",
  videoDemo: "Video Demo",
  comparison: "Comparison",
  metrics: "Metrics",
};

// ── Priority constants ───────────────────────────────────────────────────────

/** Sort order for priorities (lower = more urgent). */
export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

/** Dot/text accent colors for each priority level. */
export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#f43f5e",
  high: "#f97316",
  medium: "#10b981",
};

/** Full badge styles for priority pills (bg + text color + border). */
export const PRIORITY_STYLES: Record<Priority, { bg: string; color: string; border: string; label: string }> = {
  critical: { bg: "#fef2f2", color: "#f43f5e", border: "#fecaca", label: "Critical" },
  high:     { bg: "#fffbeb", color: "#f97316", border: "#fde68a", label: "High" },
  medium:   { bg: "#f0fdf4", color: "#10b981", border: "#bbf7d0", label: "Medium" },
};
