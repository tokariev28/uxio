"use client";

import { useState } from "react";
import { ScreenshotViewer } from "./ScreenshotViewer";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { InsightSlider } from "./InsightSlider";
import type {
  SectionAnalysis,
  SectionType,
  PageData,
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

const OBJECT_POSITION: Record<SectionType, string> = {
  hero: "top",
  navigation: "top",
  features: "25% top",
  benefits: "30% top",
  socialProof: "40% top",
  testimonials: "45% top",
  integrations: "50% top",
  howItWorks: "55% top",
  pricing: "60% top",
  faq: "70% top",
  cta: "80% top",
  footer: "bottom",
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

// ── Helpers ────────────────────────────────────────────────────────────────

function domainFrom(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionAnalysis;
  pages: PageData[];
  competitors: Competitor[];
  recommendations: Recommendation[];
  sectionIndex: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SectionCard({
  section,
  pages,
  competitors,
  recommendations,
  sectionIndex,
}: SectionCardProps) {
  const [lightbox, setLightbox] = useState<{ src: string | undefined; domain: string } | null>(null);

  const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;
  const objPos = OBJECT_POSITION[section.sectionType] ?? "top";

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

  // ── Competitor screenshots (no "YOU") ──────────────────────────────────
  const competitorCols = competitors.slice(0, 3).map((c, i) => ({
    key: c.name,
    src: pages[i + 1]?.screenshotBase64,
    siteUrl: c.url,
    domain: domainFrom(c.url),
  }));

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
      {/* ── Header (always visible, no collapse) ─────────────────────── */}
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
        {/* Insight Slider */}
        {sectionInsights.length > 0 ? (
          <InsightSlider insights={sectionInsights} />
        ) : (
          <p style={{ fontSize: 14, color: "#9ca3af" }}>
            No specific insights for this section.
          </p>
        )}

        {/* Competitor Reference */}
        {competitorCols.length > 0 && (
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: 14,
              padding: "20px 22px",
              marginTop: 20,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 14,
              }}
            >
              Competitor Reference
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${competitorCols.length}, 1fr)`,
                gap: 12,
              }}
            >
              {competitorCols.map((col) => (
                <div key={col.key}>
                  <div
                    onClick={() => setLightbox({ src: col.src, domain: col.domain })}
                    style={{
                      position: "relative",
                      height: 110,
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid rgba(0,0,0,0.04)",
                      cursor: "pointer",
                      transition: "all 200ms ease",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget;
                      el.style.borderColor = "rgba(0,0,0,0.12)";
                      el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
                      const hint = el.querySelector("[data-expand-hint]") as HTMLElement | null;
                      if (hint) hint.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget;
                      el.style.borderColor = "rgba(0,0,0,0.04)";
                      el.style.boxShadow = "none";
                      const hint = el.querySelector("[data-expand-hint]") as HTMLElement | null;
                      if (hint) hint.style.opacity = "0";
                    }}
                  >
                    <ScreenshotViewer
                      src={col.src}
                      siteUrl={col.siteUrl}
                      alt={`${label} — ${col.domain}`}
                      objectPosition={objPos}
                      height={110}
                    />
                    <div
                      data-expand-hint
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.9)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0,
                        transition: "opacity 200ms ease",
                        zIndex: 1,
                      }}
                    >
                      <svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                        <path
                          d="M8.5 2H12V5.5M5.5 12H2V8.5M12 2L8 6M2 12L6 8"
                          stroke="#374151"
                          strokeWidth={1.3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <p style={{ marginTop: 7, fontSize: 12, fontWeight: 500, color: "#374151", letterSpacing: "-0.005em" }}>
                    {col.domain}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <ScreenshotLightbox
          src={lightbox.src}
          domain={lightbox.domain}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
