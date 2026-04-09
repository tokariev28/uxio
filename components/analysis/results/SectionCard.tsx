"use client";

import { InsightSlider } from "./InsightSlider";
import type {
  SectionAnalysis,
  SectionType,
  Competitor,
  Recommendation,
  Priority,
} from "@/lib/types/analysis";

// ── Constants ──────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<SectionType, string> = {
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
};

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#dc2626",
  high: "#d97706",
  medium: "#16a34a",
};

// ── Props ──────────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionAnalysis;
  competitors: Competitor[];
  recommendations: Recommendation[];
  sectionIndex: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SectionCard({
  section,
  competitors,
  recommendations,
  sectionIndex,
}: SectionCardProps) {
  const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;

  // ── Insights: filter by section ────────────────────────────────────────
  const sectionInsights = recommendations
    .filter((r) => r.section === section.sectionType)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 5);

  // ── Priority counts for header ─────────────────────────────────────────
  const priorityCounts: { priority: Priority; count: number }[] = [];
  for (const p of ["critical", "high", "medium"] as Priority[]) {
    const count = sectionInsights.filter((r) => r.priority === p).length;
    if (count > 0) priorityCounts.push({ priority: p, count });
  }

  // ── Strength / weakness tags (1 each from input finding) ───────────────
  const inputFinding = section.findings.find((f) => f.site === "input");
  const topStrength = inputFinding?.strengths[0];
  const topWeakness = inputFinding?.weaknesses[0];

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 16,
        marginBottom: 8,
        background: "#ffffff",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        padding: "0 32px 32px",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 0",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 400, color: "#c4c4c4", minWidth: 22 }}>
          {String(sectionIndex + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#111", letterSpacing: "-0.02em" }}>
          {label}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {priorityCounts.map(({ priority, count }) => (
            <div
              key={priority}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: PRIORITY_COLORS[priority],
                  flexShrink: 0,
                }}
              />
              <span style={{ color: PRIORITY_COLORS[priority] }}>
                {count} {priority}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 8 }}>
        {/* Strength / weakness tags */}
        {(topStrength || topWeakness) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {topWeakness && (
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(220,38,38,0.07)",
                  color: "#b91c1c",
                  border: "1px solid rgba(220,38,38,0.15)",
                }}
              >
                {topWeakness}
              </span>
            )}
            {topStrength && (
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(22,163,74,0.07)",
                  color: "#15803d",
                  border: "1px solid rgba(22,163,74,0.15)",
                }}
              >
                {topStrength}
              </span>
            )}
          </div>
        )}

        {/* Insight Slider */}
        {sectionInsights.length > 0 ? (
          <InsightSlider insights={sectionInsights} competitors={competitors} />
        ) : (
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            No specific insights for this section.
          </p>
        )}
      </div>
    </div>
  );
}
