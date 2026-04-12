"use client";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { AnalysisResult, Priority } from "@/lib/types/analysis";
import { SECTION_LABELS, PRIORITY_COLORS, PRIORITY_ORDER } from "@/lib/constants";
import { getScoreColor, getGradeLabel } from "@/lib/utils/score";
import { getHostnameOrEmpty } from "@/lib/utils/url";

// ── Helpers ────────────────────────────────────────────────────────────────

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

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}


// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },

  // ── Header (3-column flex) ─────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  favicon: {
    width: 20,
    height: 20,
    borderRadius: 3,
  },
  siteName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  siteUrl: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 2,
  },
  headerCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 28,
  },
  headerRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  dateLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#9ca3af",
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 11,
    color: "#6b7280",
  },

  divider: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginVertical: 18,
  },

  // ── Score block ────────────────────────────────────────────────────────
  scoreBlock: {
    alignItems: "center",
    marginBottom: 20,
  },
  scoreNumber: {
    fontSize: 64,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -2,
    lineHeight: 1,
  },
  scoreLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  gradePill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  gradePillText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },

  // ── Summary ────────────────────────────────────────────────────────────
  summaryBox: {
    backgroundColor: "#f7f7f8",
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6b7280",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 11,
    color: "#374151",
    lineHeight: 1.6,
  },

  // ── Section card ───────────────────────────────────────────────────────
  sectionBlock: {
    borderWidth: 1,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#ffffff",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sectionScore: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    minWidth: 24,
  },
  sectionName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    flex: 1,
  },
  priorityBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  priorityBadgeText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionBody: {
    padding: 14,
    paddingTop: 12,
    gap: 10,
  },

  // ── Strengths / Weaknesses ─────────────────────────────────────────────
  swRow: {
    flexDirection: "row",
    gap: 16,
  },
  swCol: {
    flex: 1,
  },
  swColLabel: {
    fontSize: 10,
    fontFamily: "Helvetica",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  swTag: {
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  swTagText: {
    fontSize: 14,
    lineHeight: 1.45,
  },

  // ── Insight cards (stacked) ────────────────────────────────────────────
  insightStack: {
    gap: 8,
  },
  insightCard: {
    borderWidth: 1,
    borderColor: "#ebebeb",
    borderRadius: 8,
  },
  insightBody: {
    padding: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 5,
  },
  insightPriorityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  insightPriorityText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    lineHeight: 1.35,
  },
  insightReasoning: {
    fontSize: 9,
    color: "#64748b",
    lineHeight: 1.7,
  },

  // ── Recommendation block (card-in-card) ────────────────────────────────
  recBlock: {
    marginHorizontal: 14,
    marginBottom: 12,
    marginTop: 4,
    backgroundColor: "#f7f7f8",
    borderRadius: 7,
    padding: 10,
    gap: 4,
  },
  recLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: "#6b7280",
  },
  recText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    lineHeight: 1.45,
  },
  recImpactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 2,
  },
  recImpactArrow: {
    fontSize: 9,
    color: "#9ca3af",
  },
  recImpactText: {
    fontSize: 9,
    color: "#6b7280",
    lineHeight: 1.6,
    flex: 1,
  },
});

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  result: AnalysisResult;
  logoUrl: string;
}

export function AnalysisPDF({ result, logoUrl }: Props) {
  const score = computeScore(result);
  const gradeLabel = getGradeLabel(score);
  const scoreColor = getScoreColor(score);
  const siteUrl = result.pages[0]?.url ?? "";
  const host = getHostnameOrEmpty(siteUrl);

  const sortedSections = [...result.sections]
    .filter((sec) => sec.findings.some((f) => f.site === "input"))
    .sort((a, b) => (a.scrollFraction ?? 1) - (b.scrollFraction ?? 1));

  // Compute a single-page height so react-pdf never inserts page breaks.
  // Estimates are conservative (tall) — PDF viewers scroll to content end naturally.
  const totalInsights = sortedSections.reduce(
    (sum, sec) =>
      sum + Math.min(result.recommendations.filter((r) => r.section === sec.sectionType).length, 5),
    0
  );
  const pageHeight = Math.round(
    (400 +
      (result.executiveSummary ? 120 : 0) +
      sortedSections.length * 200 +
      totalInsights * 175) *
      1.15 // 15 % buffer for variable text lengths
  );

  return (
    <Document
      title={`${result.productBrief.company} — Uxio Analysis`}
      author="Uxio"
      creator="Uxio"
    >
      <Page size={[595.28, pageHeight]} style={s.page}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.header}>
          {/* Left: favicon + company name + URL */}
          <View style={s.headerLeft}>
            {host ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image
                style={s.favicon}
                src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
              />
            ) : null}
            <View>
              <Text style={s.siteName}>{result.productBrief.company}</Text>
              <Text style={s.siteUrl}>{host}</Text>
            </View>
          </View>

          {/* Center: Uxio logo */}
          <View style={s.headerCenter}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoUrl} />
          </View>

          {/* Right: date */}
          <View style={s.headerRight}>
            <Text style={s.dateLabel}>Analyzed</Text>
            <Text style={s.dateValue}>{formatDate()}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Score ──────────────────────────────────────────────── */}
        <View style={s.scoreBlock}>
          <Text style={[s.scoreNumber, { color: scoreColor }]}>{score}</Text>
          <Text style={s.scoreLabel}>CONVERSION SCORE</Text>
          <View style={[s.gradePill, { borderColor: scoreColor }]}>
            <Text style={[s.gradePillText, { color: scoreColor }]}>{gradeLabel}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Executive summary ──────────────────────────────────── */}
        {result.executiveSummary ? (
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>AI Summary</Text>
            <Text style={s.summaryText}>{result.executiveSummary}</Text>
          </View>
        ) : null}

        {/* ── Sections ───────────────────────────────────────────── */}
        {sortedSections.map((section) => {
          const inputFinding = section.findings.find((f) => f.site === "input");
          const sectionScore = inputFinding ? Math.round(inputFinding.score * 100) : null;
          const sectionColor = sectionScore !== null ? getScoreColor(sectionScore) : "#6b7280";
          const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;

          const sectionInsights = result.recommendations
            .filter((r) => r.section === section.sectionType)
            .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
            .slice(0, 5);

          const priorityCounts: { priority: Priority; count: number }[] = (
            ["critical", "high", "medium"] as Priority[]
          )
            .map((p) => ({ priority: p, count: sectionInsights.filter((r) => r.priority === p).length }))
            .filter(({ count }) => count > 0);

          const strengths = inputFinding?.strengths.slice(0, 1) ?? [];
          const weaknesses = inputFinding?.weaknesses.slice(0, 1) ?? [];
          const hasSwData = strengths.length > 0 || weaknesses.length > 0;

          return (
            <View key={section.sectionType} style={s.sectionBlock}>
              {/* Section header */}
              <View style={s.sectionHeader} wrap={false}>
                {sectionScore !== null && (
                  <Text style={[s.sectionScore, { color: sectionColor }]}>
                    {sectionScore}
                  </Text>
                )}
                <Text style={s.sectionName}>{label}</Text>
                <View style={s.priorityBadges}>
                  {priorityCounts.map(({ priority, count }) => (
                    <View key={priority} style={s.priorityBadge}>
                      <View style={[s.priorityDot, { backgroundColor: PRIORITY_COLORS[priority] }]} />
                      <Text style={[s.priorityBadgeText, { color: PRIORITY_COLORS[priority] }]}>
                        {count} {priority}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={s.sectionBody}>
                {/* Strengths / Weaknesses */}
                {hasSwData && (
                  <View style={s.swRow}>
                    {strengths.length > 0 && (
                      <View style={s.swCol}>
                        <View style={[s.swTag, { backgroundColor: "#E9F8F3" }]}>
                          <Text style={[s.swColLabel, { color: "#047857" }]}>Strengths:</Text>
                          <Text style={[s.swTagText, { color: "#047857" }]}>{strengths[0]}</Text>
                        </View>
                      </View>
                    )}
                    {weaknesses.length > 0 && (
                      <View style={s.swCol}>
                        <View style={[s.swTag, { backgroundColor: "#FEEEF0" }]}>
                          <Text style={[s.swColLabel, { color: "#be123c" }]}>Weaknesses:</Text>
                          <Text style={[s.swTagText, { color: "#be123c" }]}>{weaknesses[0]}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Insight cards stacked */}
                <View style={s.insightStack}>
                  {sectionInsights.map((rec, i) => (
                    <View key={i} style={s.insightCard} wrap={false}>
                      <View style={s.insightBody}>
                        <View style={s.insightPriorityRow}>
                          <View style={[s.priorityDot, { backgroundColor: PRIORITY_COLORS[rec.priority] }]} />
                          <Text style={[s.insightPriorityText, { color: PRIORITY_COLORS[rec.priority] }]}>
                            {rec.priority}
                          </Text>
                        </View>
                        <Text style={s.insightTitle}>{rec.title}</Text>
                        {rec.reasoning ? (
                          <Text style={s.insightReasoning}>{rec.reasoning}</Text>
                        ) : null}
                      </View>
                      {rec.suggestedAction ? (
                        <View style={s.recBlock}>
                          <Text style={s.recLabel}>Recommendation</Text>
                          <Text style={s.recText}>{rec.suggestedAction}</Text>
                          {rec.impact ? (
                            <View style={s.recImpactRow}>
                              <Text style={s.recImpactArrow}>↳</Text>
                              <Text style={s.recImpactText}>{rec.impact}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })}

      </Page>
    </Document>
  );
}
