# PDF Export Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `AnalysisPDF.tsx` so the exported PDF matches the current results page design — new 3-column header, strength/weakness tags, and stacked insight cards with recommendation blocks.

**Architecture:** Two files touched. `ExportPDFButton.tsx` resolves the logo URL and passes it as a prop. `AnalysisPDF.tsx` is fully rewritten: new `StyleSheet`, new header layout, per-section S/W row, and stacked insight cards replacing the old flat rec cards. No data-flow changes — all required fields already exist on `AnalysisResult`.

**Tech Stack:** `@react-pdf/renderer` (already installed), TypeScript strict, Next.js App Router (client component).

---

## Files

| Action | File |
|---|---|
| Modify | `components/analysis/results/ExportPDFButton.tsx` |
| Modify | `components/analysis/results/AnalysisPDF.tsx` |

---

### Task 1: Pass `logoUrl` from ExportPDFButton

**Files:**
- Modify: `components/analysis/results/ExportPDFButton.tsx:23`

- [ ] **Step 1: Add logoUrl to the pdf() call**

Replace line 23 in `ExportPDFButton.tsx`:

```tsx
// BEFORE
const blob = await pdf(<AnalysisPDF result={result} />).toBlob();

// AFTER
const logoUrl = window.location.origin + "/logo.svg";
const blob = await pdf(<AnalysisPDF result={result} logoUrl={logoUrl} />).toBlob();
```

- [ ] **Step 2: Verify TypeScript accepts this (it will once Task 2 adds the prop)**

---

### Task 2: Rewrite AnalysisPDF.tsx

**Files:**
- Modify: `components/analysis/results/AnalysisPDF.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file with the implementation below**

```tsx
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { AnalysisResult, Priority, SectionType } from "@/lib/types/analysis";

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

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
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

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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
    gap: 10,
  },
  swCol: {
    flex: 1,
    gap: 5,
  },
  swColLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  swTag: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
  },
  swTagText: {
    fontSize: 10,
    lineHeight: 1.5,
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
  const host = getHostname(siteUrl);

  const sortedSections = [...result.sections]
    .filter((sec) => sec.findings.some((f) => f.site === "input"))
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
        <View style={s.header}>
          {/* Left: favicon + company name + URL */}
          <View style={s.headerLeft}>
            {host ? (
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
                        <Text style={[s.swColLabel, { color: "#15803d" }]}>Strengths</Text>
                        <View style={[s.swTag, { backgroundColor: "#f0fbf5", borderColor: "#d1f5e0" }]}>
                          <Text style={[s.swTagText, { color: "#15803d" }]}>{strengths[0]}</Text>
                        </View>
                      </View>
                    )}
                    {weaknesses.length > 0 && (
                      <View style={s.swCol}>
                        <Text style={[s.swColLabel, { color: "#b91c1c" }]}>Weaknesses</Text>
                        <View style={[s.swTag, { backgroundColor: "#fef5f5", borderColor: "#fdd8d8" }]}>
                          <Text style={[s.swTagText, { color: "#b91c1c" }]}>{weaknesses[0]}</Text>
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
```

- [ ] **Step 2: Run the linter to check for TypeScript errors**

```bash
cd /Users/yaroslavtokariev/Desktop/Ярослав/Uxio && npm run lint
```

Expected: no errors in `AnalysisPDF.tsx` or `ExportPDFButton.tsx`.  
If `rec.impact` shows a type error, check `lib/types/analysis.ts` — the field exists on `Recommendation` (used by `SectionInsightCard.tsx`).

- [ ] **Step 3: Commit**

```bash
git add components/analysis/results/AnalysisPDF.tsx components/analysis/results/ExportPDFButton.tsx
git commit -m "feat: redesign PDF export to match updated results page UI"
```

---

### Task 3: Verify the PDF output

- [ ] **Step 1: Open the app and run an analysis**

```bash
npm run dev
```

Open `http://localhost:3000`, submit a URL, wait for analysis to complete.

- [ ] **Step 2: Export a PDF and check each element**

Click "Export PDF" and open the downloaded file. Verify:

| Element | Expected |
|---|---|
| Header | Favicon + company name + URL left · Uxio logo centered (black) · "Analyzed / April 10, 2026" right |
| Score | Large number, color-coded, grade pill — unchanged |
| Section header | Score number (color) + section name + `● N critical · ● N high` badges |
| S/W row | Green strength tag and red weakness tag, same height |
| Insight cards | Stacked, each with priority dot, 12px bold title, reasoning in slate, gray rec block |
| Impact | `↳ ...` italic line inside rec block when data exists |
| Page breaks | Single insight card is never split across pages |

- [ ] **Step 3: Test edge cases**

- Section with only 1 insight — renders one card cleanly
- Section with no strengths/weaknesses — S/W row is absent (no empty boxes)
- Section with 5 insights — all 5 cards appear stacked

---

## Self-Review

**Spec coverage:**
- ✅ 3-column header with favicon, logo, date — Task 2
- ✅ Score block unchanged — Task 2 (preserved)
- ✅ Priority badges in section header — Task 2
- ✅ Equal-height S/W tags — Task 2 (`flexGrow: 1` + row `alignItems: stretch`)
- ✅ Stacked insight cards, up to 5 — Task 2
- ✅ `rec.impact` shown with ↳ — Task 2
- ✅ `logoUrl` passed from ExportPDFButton — Task 1

**Placeholder scan:** No TBD/TODO present.

**Type consistency:** `Priority`, `SectionType`, `AnalysisResult` used consistently. `rec.impact`, `inputFinding.strengths`, `inputFinding.weaknesses` all exist on their respective types (confirmed from `SectionInsightCard.tsx` and `SectionCard.tsx` usage).

**rgba note:** Replaced `rgba(22,163,74,0.07)` → `#f0fbf5` and `rgba(220,38,38,0.07)` → `#fef5f5` with hex equivalents to avoid any @react-pdf/renderer rgba edge cases.
