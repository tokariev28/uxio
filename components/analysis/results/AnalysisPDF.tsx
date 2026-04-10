import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { AnalysisResult, SectionType, Priority } from "@/lib/types/analysis";

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

const SECTION_ORDER: SectionType[] = [
  "hero", "navigation", "features", "benefits",
  "socialProof", "testimonials", "integrations",
  "howItWorks", "pricing", "faq", "cta", "footer",
];

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#dc2626",
  high: "#d97706",
  medium: "#16a34a",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function getGradeLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs work";
  return "Critical";
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
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brandName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    letterSpacing: -0.5,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  siteName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },
  siteUrl: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  generatedDate: {
    fontSize: 9,
    color: "#9ca3af",
    marginTop: 4,
  },

  divider: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginVertical: 20,
  },

  // Score block
  scoreBlock: {
    alignItems: "center",
    marginBottom: 24,
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

  // Summary block
  summaryBox: {
    backgroundColor: "#f7f7f8",
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
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

  // Section
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  sectionScore: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    minWidth: 28,
  },
  sectionName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
  },

  // Recommendation card
  recCard: {
    backgroundColor: "#f7f7f8",
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  recTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 5,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  priorityLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    marginBottom: 5,
  },
  recReasoning: {
    fontSize: 10,
    color: "#64748b",
    lineHeight: 1.6,
    marginBottom: 8,
  },
  recActionBox: {
    backgroundColor: "#efefef",
    borderRadius: 4,
    padding: "8 10",
  },
  recActionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6b7280",
    marginBottom: 3,
  },
  recActionText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111111",
    lineHeight: 1.4,
  },
});

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  result: AnalysisResult;
}

export function AnalysisPDF({ result }: Props) {
  const score = computeScore(result);
  const gradeLabel = getGradeLabel(score);
  const scoreColor = getScoreColor(score);
  const siteUrl = result.pages[0]?.url ?? "";

  // Only sections where the input page has a finding, in canonical order
  const sortedSections = [...result.sections]
    .filter((s) => s.findings.some((f) => f.site === "input"))
    .sort((a, b) => {
      const ai = SECTION_ORDER.indexOf(a.sectionType);
      const bi = SECTION_ORDER.indexOf(b.sectionType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return (
    <Document
      title={`${result.productBrief.company} — Uxio Analysis`}
      author="Uxio"
      creator="Uxio"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <Text style={s.brandName}>Uxio</Text>
          <View style={s.headerRight}>
            <Text style={s.siteName}>{result.productBrief.company}</Text>
            <Text style={s.siteUrl}>{siteUrl}</Text>
            <Text style={s.generatedDate}>Generated {formatDate()}</Text>
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
          <>
            <View style={s.summaryBox}>
              <Text style={s.summaryLabel}>AI Summary</Text>
              <Text style={s.summaryText}>{result.executiveSummary}</Text>
            </View>
          </>
        ) : null}

        {/* ── Sections ───────────────────────────────────────────── */}
        {sortedSections.map((section) => {
          const inputFinding = section.findings.find((f) => f.site === "input");
          const sectionScore = inputFinding
            ? Math.round(inputFinding.score * 100)
            : null;
          const sectionColor = sectionScore !== null ? getScoreColor(sectionScore) : "#6b7280";
          const recommendations = result.recommendations.filter(
            (r) => r.section === section.sectionType
          );
          const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;

          return (
            <View key={section.sectionType} style={s.sectionBlock} wrap={false}>
              {/* Section header */}
              <View style={s.sectionHeader}>
                {sectionScore !== null && (
                  <Text style={[s.sectionScore, { color: sectionColor }]}>
                    {sectionScore}
                  </Text>
                )}
                <Text style={s.sectionName}>{label}</Text>
              </View>

              {/* Recommendation cards */}
              {recommendations.map((rec, i) => (
                <View key={i} style={s.recCard}>
                  {/* Priority row */}
                  <View style={s.recTopRow}>
                    <View
                      style={[
                        s.priorityDot,
                        { backgroundColor: PRIORITY_COLORS[rec.priority] },
                      ]}
                    />
                    <Text
                      style={[
                        s.priorityLabel,
                        { color: PRIORITY_COLORS[rec.priority] },
                      ]}
                    >
                      {rec.priority}
                    </Text>
                  </View>

                  {/* Title */}
                  <Text style={s.recTitle}>{rec.title}</Text>

                  {/* Reasoning */}
                  <Text style={s.recReasoning}>{rec.reasoning}</Text>

                  {/* Suggested action */}
                  {rec.suggestedAction && (
                    <View style={s.recActionBox}>
                      <Text style={s.recActionLabel}>Recommendation</Text>
                      <Text style={s.recActionText}>{rec.suggestedAction}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          );
        })}

      </Page>
    </Document>
  );
}
