import type { AnalysisResult, SectionFinding } from "@/lib/types/analysis";

export interface QualityReport {
  overallQuality: number;
  signals: {
    evidenceGrounding: number;
    scoreVariance: number;
    specificityRate: number;
    competitorPresence: number;
    fieldCompleteness: number;
  };
  warnings: string[];
}

const GENERIC_VERB_RE =
  /^(improve|enhance|optimize|consider|update|refine|redesign|revamp|rework|address|ensure)\b/i;

function isEvidenceGrounded(text: string, competitorNames: string[]): boolean {
  if (/"[^"]{3,}"/.test(text)) return true;
  if (/\b\d+[%xk$ms]?\b/.test(text)) return true;
  return competitorNames.some((name) =>
    text.toLowerCase().includes(name.toLowerCase())
  );
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scoreAnalysisQuality(result: AnalysisResult): QualityReport {
  const warnings: string[] = [];
  const competitorNames = result.competitors.map((c) => c.name);
  const allFindings: SectionFinding[] = result.sections.flatMap(
    (s) => s.findings
  );

  // ── Signal 1: Evidence Grounding Rate (weight 30%) ────────────────
  const allInsights: string[] = allFindings.flatMap((f) => [
    ...f.strengths,
    ...f.weaknesses,
  ]);
  const groundedCount = allInsights.filter((s) =>
    isEvidenceGrounded(s, competitorNames)
  ).length;
  const evidenceGrounding =
    allInsights.length > 0 ? (groundedCount / allInsights.length) * 100 : 0;

  if (evidenceGrounding < 60) {
    warnings.push(
      `Only ${evidenceGrounding.toFixed(0)}% of insights cite specific evidence — analysis may contain fabricated observations`
    );
  }

  // ── Signal 2: Score Variance (weight 25%) ─────────────────────────
  const allScores = allFindings.map((f) => f.score);
  const sd = stdDev(allScores);
  // std ≤ 0.05 → 0, std ≥ 0.25 → 100, linear between
  const scoreVariance = clamp(((sd - 0.05) / (0.25 - 0.05)) * 100, 0, 100);

  if (scoreVariance < 40) {
    warnings.push(
      `Score variance is critically low (std dev ${sd.toFixed(3)}) — LLM may be averaging rather than discriminating`
    );
  }

  // ── Signal 3: Specificity Rate (weight 20%) ───────────────────────
  const actions = result.recommendations.map((r) => r.suggestedAction);
  const genericCount = actions.filter((a) =>
    GENERIC_VERB_RE.test(a.trim())
  ).length;
  const specificityRate =
    actions.length > 0
      ? ((actions.length - genericCount) / actions.length) * 100
      : 100;

  if (specificityRate < 70) {
    warnings.push(
      `${genericCount} of ${actions.length} action items start with a generic verb — recommendations lack specificity`
    );
  }

  // ── Signal 4: Competitor Name Presence (weight 15%) ───────────────
  const examples = result.recommendations.map((r) => r.exampleFromCompetitor);
  const namedCount = examples.filter((ex) =>
    competitorNames.some((name) =>
      ex.toLowerCase().includes(name.toLowerCase())
    )
  ).length;
  const competitorPresence =
    examples.length > 0 ? (namedCount / examples.length) * 100 : 0;

  if (competitorPresence < 80) {
    warnings.push(
      `${competitorPresence.toFixed(0)}% of competitor examples name a specific competitor from the validated list`
    );
  }

  // ── Signal 5: Field Completeness (weight 10%) ─────────────────────
  const completeCount = allFindings.filter((f) => {
    const hasStrengths = f.strengths.length > 0;
    const hasWeaknesses = f.weaknesses.length > 0;
    const hasEvidence =
      Boolean(f.evidence.headlineText) ||
      Boolean(f.evidence.ctaText) ||
      Boolean(f.evidence.quote) ||
      Boolean(f.evidence.visualNote);
    return hasStrengths && hasWeaknesses && hasEvidence;
  }).length;
  const fieldCompleteness =
    allFindings.length > 0
      ? (completeCount / allFindings.length) * 100
      : 100;

  if (fieldCompleteness < 90) {
    warnings.push(
      `${(100 - fieldCompleteness).toFixed(0)}% of section findings have missing strengths, weaknesses, or evidence fields`
    );
  }

  // ── Overall Quality ───────────────────────────────────────────────
  const overallQuality =
    0.3 * evidenceGrounding +
    0.25 * scoreVariance +
    0.2 * specificityRate +
    0.15 * competitorPresence +
    0.1 * fieldCompleteness;

  return {
    overallQuality: round1(overallQuality),
    signals: {
      evidenceGrounding: round1(evidenceGrounding),
      scoreVariance: round1(scoreVariance),
      specificityRate: round1(specificityRate),
      competitorPresence: round1(competitorPresence),
      fieldCompleteness: round1(fieldCompleteness),
    },
    warnings,
  };
}
