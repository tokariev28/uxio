"use client";

import type { Recommendation, Priority } from "@/lib/types/analysis";

interface InsightCardProps {
  insight: Recommendation;
  index: number;  // 1-based
  total: number;
}

const PRIORITY_STYLES: Record<Priority, { bg: string; color: string; border: string; label: string }> = {
  critical: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca", label: "Critical" },
  high:     { bg: "#fffbeb", color: "#d97706", border: "#fde68a", label: "High" },
  medium:   { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0", label: "Medium" },
};

export function SectionInsightCard({ insight, index, total }: InsightCardProps) {
  const style = PRIORITY_STYLES[insight.priority] ?? {
    bg: "#f8fafc", color: "#6b7280", border: "#e2e8f0", label: "Low",
  };
  const isEvidenceBased = !!insight.exampleFromCompetitor?.trim();

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "20px 22px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Top row: priority badge + "N of total" */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            background: style.bg,
            color: style.color,
            border: `1px solid ${style.border}`,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {style.label}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          {index} of {total}
        </span>
      </div>

      {/* Title */}
      <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.4 }}>
        {insight.title}
      </p>

      {/* Body text — full, no truncation */}
      {insight.reasoning && (
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", margin: "6px 0 0" }}>
          {insight.reasoning}
        </p>
      )}

      {/* Competitor evidence block */}
      {insight.exampleFromCompetitor && (
        <div
          style={{
            background: "#f8fafc",
            borderLeft: "3px solid #e2e8f0",
            padding: "10px 14px",
            borderRadius: "0 8px 8px 0",
            marginTop: 12,
            fontSize: 13,
            fontStyle: "italic",
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          {insight.exampleFromCompetitor}
        </div>
      )}

      {/* Confidence indicator */}
      <div style={{ marginTop: 12 }}>
        <span
          style={{
            fontSize: 11,
            color: isEvidenceBased ? "#16a34a" : "#d97706",
          }}
        >
          {isEvidenceBased ? "● Evidence-based" : "● Inferred"}
        </span>
      </div>

      {/* Action item */}
      {insight.suggestedAction && (
        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            paddingTop: 12,
            marginTop: 14,
            fontSize: 13,
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.5,
          }}
        >
          → {insight.suggestedAction}
        </div>
      )}
    </div>
  );
}
