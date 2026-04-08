"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ScreenshotViewer } from "./ScreenshotViewer";
import { SectionInsightCard } from "./SectionInsightCard";
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

// ── Helpers ────────────────────────────────────────────────────────────────

function domainFrom(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function IssuePill({ count, level }: { count: number; level: "critical" | "high" }) {
  const styles = {
    critical: { bg: "#fef2f2", color: "#dc2626" },
    high:     { bg: "#fffbeb", color: "#d97706" },
  };
  const s = styles[level];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      {count} {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: SectionAnalysis;
  pages: PageData[];
  competitors: Competitor[];
  recommendations: Recommendation[];
  sectionIndex: number;
  defaultOpen?: boolean;
  /** Pass true for the first card only, to log first rec for verification */
  logFirstRec?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SectionCard({
  section,
  pages,
  competitors,
  recommendations,
  sectionIndex,
  defaultOpen = false,
  logFirstRec = false,
}: SectionCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Auto-expand on scroll into view ──────────────────────────────────────
  useEffect(() => {
    if (defaultOpen || !cardRef.current) return;
    const el = cardRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsOpen(true);
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [defaultOpen]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const inputFinding = section.findings.find((f) => f.site === "input");
  const sectionScore = inputFinding?.score ?? null;
  const displayScore =
    sectionScore !== null ? `${(sectionScore * 10).toFixed(1)} / 10` : null;
  const keyFinding = inputFinding?.summary ?? "";
  const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;
  const objPos = OBJECT_POSITION[section.sectionType] ?? "top";

  // ── Insights: filter by section, fallback to all sorted ──────────────────
  const sectionFiltered = recommendations
    .filter((r) => r.section === section.sectionType)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 5);

  const sectionInsights =
    sectionFiltered.length > 0
      ? sectionFiltered
      : recommendations
          .slice()
          .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
          .slice(0, 5);

  const criticalCount = sectionInsights.filter((r) => r.priority === "critical").length;
  const highCount = sectionInsights.filter((r) => r.priority === "high").length;

  // ── Console.log verification (first card only) ────────────────────────────
  useEffect(() => {
    if (logFirstRec && recommendations.length > 0) {
      console.log("[Uxio] First recommendation (section field verification):", recommendations[0]);
    }
  }, [logFirstRec, recommendations]);

  // ── Best competitor for this section ─────────────────────────────────────
  const bestCompetitorSite = [...section.findings]
    .filter((f) => f.site !== "input")
    .sort((a, b) => b.score - a.score)[0]?.site;

  // ── Screenshot columns ────────────────────────────────────────────────────
  type ColData = {
    key: string;
    src: string | undefined;
    siteUrl: string | undefined;
    domain: string;
    headline: string | undefined;
    ctaText: string | undefined;
    isBest: boolean;
    isInput: boolean;
    label: string;
  };

  const cols: ColData[] = [
    {
      key: "input",
      src: pages[0]?.screenshotBase64,
      siteUrl: pages[0]?.url,
      domain: domainFrom(pages[0]?.url),
      headline: inputFinding?.evidence.headlineText,
      ctaText: inputFinding?.evidence.ctaText,
      isBest: false,
      isInput: true,
      label: "YOU",
    },
    ...competitors.slice(0, 2).map((c, i) => {
      const finding = section.findings.find((f) => f.site === c.name);
      return {
        key: c.name,
        src: pages[i + 1]?.screenshotBase64,
        siteUrl: c.url,
        domain: domainFrom(c.url),
        headline: finding?.evidence.headlineText,
        ctaText: finding?.evidence.ctaText,
        isBest: c.name === bestCompetitorSite,
        isInput: false,
        label: c.name,
      };
    }),
  ];

  return (
    <div
      ref={cardRef}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        marginBottom: 8,
        background: "#ffffff",
        overflow: "hidden",
        boxShadow: isOpen ? "0 4px 24px rgba(0,0,0,0.06)" : "none",
        transition: "box-shadow 300ms ease",
      }}
    >
      {/* ── Collapsed header (always visible, clickable) ──────────────── */}
      <div
        onClick={() => setIsOpen((o) => !o)}
        style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 14,
          cursor: "pointer",
          background: isOpen ? "#ffffff" : "#ffffff",
          transition: "background 180ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "#f9fafb";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "#ffffff";
        }}
      >
        {/* Index */}
        <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500, minWidth: 28, flexShrink: 0 }}>
          {String(sectionIndex + 1).padStart(2, "0")}
        </span>

        {/* Section name */}
        <span style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>{label}</span>

        {/* Score badge */}
        {displayScore && (
          <span
            style={{
              fontSize: 13,
              background: "#f3f4f6",
              padding: "2px 10px",
              borderRadius: 999,
              color: "#374151",
              flexShrink: 0,
            }}
          >
            {displayScore}
          </span>
        )}

        {/* Right side: issue pills + chevron */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {criticalCount > 0 && <IssuePill count={criticalCount} level="critical" />}
          {highCount > 0 && <IssuePill count={highCount} level="high" />}
          <ChevronDown
            size={16}
            color="#9ca3af"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 300ms ease",
              flexShrink: 0,
            }}
          />
        </div>
      </div>

      {/* ── Expanded content (Framer Motion) ─────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0.9 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0.9 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 32px 32px" }}>
              {/* A. Card Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingBottom: 16,
                  borderBottom: "1px solid #f3f4f6",
                  marginBottom: 20,
                }}
              >
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {label}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {displayScore && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                      {displayScore}
                    </span>
                  )}
                  {sectionInsights.length > 0 && (
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      {sectionInsights.length} insight{sectionInsights.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* B. Key Finding */}
              {keyFinding && (
                <div
                  style={{
                    background: "#fafafa",
                    borderLeft: "3px solid #6366f1",
                    padding: "14px 18px",
                    borderRadius: "0 10px 10px 0",
                    marginBottom: 24,
                    fontSize: 15,
                    lineHeight: 1.7,
                    fontStyle: "italic",
                    color: "#1f2937",
                  }}
                >
                  {keyFinding}
                </div>
              )}

              {/* C. Screenshot grid — 3 columns */}
              {cols.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
                    gap: 16,
                    marginBottom: 24,
                  }}
                >
                  {cols.map((col) => (
                    <div key={col.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ position: "relative" }}>
                        <ScreenshotViewer
                          key={col.src ?? col.siteUrl}
                          src={col.src}
                          siteUrl={col.siteUrl}
                          alt={`${label} — ${col.label}`}
                          objectPosition={objPos}
                          height={200}
                          className={col.isInput ? "input-screenshot" : undefined}
                        />
                        {/* YOU badge */}
                        {col.isInput && (
                          <span
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              background: "#6366f1",
                              color: "#ffffff",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "0 0 6px 0",
                              lineHeight: 1.4,
                            }}
                          >
                            YOU
                          </span>
                        )}
                        {/* Input site: accent border */}
                        {col.isInput && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: 10,
                              border: "2px solid #6366f1",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </div>

                      {/* Below screenshot: domain + headline + benchmark */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          {col.domain || col.label}
                        </span>
                        {(col.headline || col.ctaText) && (
                          <span
                            style={{
                              fontSize: 12,
                              fontStyle: "italic",
                              color: "#6b7280",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {col.headline ?? col.ctaText}
                          </span>
                        )}
                        {col.isBest && (
                          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 500 }}>
                            ✅ benchmark
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* D. Top 5 Insights */}
              {sectionInsights.length > 0 ? (
                <div>
                  <h4
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 12,
                      margin: "0 0 12px",
                    }}
                  >
                    Top Insights
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: sectionInsights.length === 1 ? "1fr" : "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    {sectionInsights.map((insight, i) => (
                      <div
                        key={i}
                        style={
                          i === 0 && sectionInsights.length >= 3
                            ? { gridColumn: "1 / -1" }
                            : {}
                        }
                      >
                        <SectionInsightCard
                          insight={insight}
                          index={i + 1}
                          total={sectionInsights.length}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 14, color: "#9ca3af" }}>
                  No specific insights for this section.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
