"use client";

import { motion } from "framer-motion";
import type { AnalysisResult, SectionFinding, SectionType } from "@/lib/types/analysis";

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

// ── Helpers ────────────────────────────────────────────────────────────────

function getColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function computeScore(result: AnalysisResult): number {
  if (result.overallScores?.input != null) {
    return Math.round(result.overallScores.input * 100);
  }
  const inputFindings = result.sections.flatMap((s) =>
    s.findings.filter((f) => f.site === "input")
  );
  if (inputFindings.length === 0) return 0;
  return Math.round(
    (inputFindings.reduce((sum, f) => sum + f.score, 0) / inputFindings.length) * 100
  );
}

// ── SVG Gauges ─────────────────────────────────────────────────────────────

function ArcGauge({ score }: { score: number }) {
  const cx = 100, cy = 108, r = 88, sw = 14;
  const startX = cx - r; // 12
  const endX = cx + r; // 188
  const angle = (Math.PI * score) / 100;
  const fillEndX = cx - r * Math.cos(angle);
  const fillEndY = cy - r * Math.sin(angle);
  const color = getColor(score);

  return (
    <svg viewBox="0 0 200 130" width={200} height={130}>
      {/* Track — sweep=1 goes upward (clockwise in SVG = through top) */}
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
        fill="none"
        stroke="#ebebeb"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* Filled arc — largeArc always 0 (arc never exceeds 180°), sweep=1 */}
      {score > 0 && (
        <path
          d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${fillEndX.toFixed(2)} ${fillEndY.toFixed(2)}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {/* Tip dot */}
      {score > 0 && score < 100 && (
        <circle cx={fillEndX} cy={fillEndY} r={sw / 2 + 1.5} fill={color} />
      )}
      {/* Score number */}
      <text
        x="100"
        y="82"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontSize: 48, fontWeight: 700, fill: "#111", letterSpacing: "-0.04em" }}
      >
        {score}
      </text>
      {/* Label */}
      <text
        x="100"
        y="120"
        textAnchor="middle"
        style={{ fontSize: 12, fill: "#6b7280", fontWeight: 400 }}
      >
        Conversion Score
      </text>
    </svg>
  );
}

function MiniArc({ score100 }: { score100: number }) {
  const cx = 14, cy = 14, r = 10, sw = 3;
  const angle = (Math.PI * score100) / 100;
  const fillEndX = cx - r * Math.cos(angle);
  const fillEndY = cy - r * Math.sin(angle);
  const color = getColor(score100);

  return (
    <svg viewBox="0 0 28 18" width={28} height={18}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#ebebeb"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {score100 > 0 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${fillEndX.toFixed(2)} ${fillEndY.toFixed(2)}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  result: AnalysisResult;
}

export function SummaryCard({ result }: SummaryCardProps) {
  const score = computeScore(result);

  const weakestSections = result.sections
    .map((s) => ({
      sectionType: s.sectionType,
      finding: s.findings.find((f) => f.site === "input"),
    }))
    .filter(
      (x): x is { sectionType: SectionType; finding: SectionFinding } =>
        x.finding !== undefined
    )
    .sort((a, b) => a.finding.score - b.finding.score)
    .slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 16,
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        padding: "28px 32px 24px",
        marginBottom: 8,
      }}
    >
      {/* ── Section A: Gauge ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <ArcGauge score={score} />
      </div>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      {weakestSections.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", margin: "20px 0 16px" }} />
      )}

      {/* ── Section B: Weakest sections ───────────────────────────────── */}
      {weakestSections.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {weakestSections.map(({ sectionType, finding }, idx) => {
            const s100 = Math.round(finding.score * 100);
            const summary = finding.weaknesses[0] ?? finding.summary;
            const label = SECTION_LABELS[sectionType] ?? sectionType;

            return (
              <div key={sectionType}>
                {idx > 0 && (
                  <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", margin: "0" }} />
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                  }}
                >
                {/* Score + mini gauge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                      minWidth: 24,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {s100}
                  </span>
                  <MiniArc score100={s100} />
                </div>

                {/* Section name */}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111",
                    whiteSpace: "nowrap",
                    minWidth: 80,
                  }}
                >
                  {label}
                </span>

                {/* Weakness summary */}
                <span
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summary}
                </span>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
