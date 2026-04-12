"use client";

import { motion } from "framer-motion";
import type { AnalysisResult } from "@/lib/types/analysis";

import { getScoreColor } from "@/lib/utils/score";

// ── Helpers ────────────────────────────────────────────────────────────────

function computeScore(result: AnalysisResult): number | null {
  if (result.overallScores?.input != null) {
    return Math.round(result.overallScores.input * 100);
  }
  const inputFindings = result.sections.flatMap((s) =>
    s.findings.filter((f) => f.site === "input")
  );
  if (inputFindings.length === 0) return null;
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
  const color = getScoreColor(score);

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

// ── Component ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  result: AnalysisResult;
}

export function SummaryCard({ result }: SummaryCardProps) {
  const score = computeScore(result);

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
        padding: "28px 32px 32px",
        marginBottom: 8,
      }}
    >
      {/* ── Section A: Gauge ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {score !== null ? (
          <ArcGauge score={score} />
        ) : (
          <div
            style={{
              height: 130,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
              }}
            >
              Score unavailable
            </span>
            <span style={{ fontSize: 12, color: "#c4c4c4" }}>
              Input page could not be analyzed
            </span>
          </div>
        )}
      </div>

      {/* ── Section B: Executive Summary ─────────────────────────────── */}
      {result.executiveSummary && (
        <>
          <div style={{ margin: "8px 0 16px" }} />
          <div
            style={{
              background: "#f7f7f8",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#6b7280",
                marginBottom: 6,
              }}
            >
              AI Summary
            </p>
            <p
              style={{
                fontSize: 14,
                color: "#374151",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {result.executiveSummary}
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
