import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import { normalizeSectionType } from "@/lib/utils/normalize-section-type";
import { stripInlineCode } from "@/lib/utils/markdown-clean";
import type { PipelineContext, Recommendation, Priority, SectionType, SectionAnalysis, OverallScores } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { VALID_SECTION_TYPES } from "@/lib/constants";

const VALID_PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);

// MVP: analyze only the most impactful sections to keep pipeline fast.
const MAX_SYNTHESIS_SECTIONS = 5;

// ── Section prioritization ───────────────────────────────────────────────
// Compute total competitive gap for a section (higher = more room for improvement).
// Used to rank which sections matter most when we need to cap.
function computeGapMagnitude(sa: SectionAnalysis): number {
  const inputF = sa.findings.find((f) => f.site === "input");
  if (!inputF?.scores) return 0;
  const compScores = sa.findings
    .filter((f) => f.site !== "input" && f.scores)
    .map((f) => f.scores!);
  if (!compScores.length) return 0;
  const axes = Object.keys(inputF.scores) as (keyof typeof inputF.scores)[];
  return axes.reduce((sum, axis) => {
    const best = Math.max(...compScores.map((s) => s[axis]));
    const gap = best - inputF.scores![axis];
    return sum + (gap > 0 ? gap : 0);
  }, 0);
}

// ── Zod schema for structured output ─────────────────────────────────────
const SynthesisSchema = z.object({
  recommendations: z.array(z.object({
    priority: z.enum(["critical", "high", "medium"]),
    section: z.string(),
    title: z.string(),
    reasoning: z.string(),
    competitorExample: z.string(),
    suggestedAction: z.string(),
    impact: z.string().optional(),
    confidence: z.number().optional(),
  })),
  executiveSummary: z.string().optional().default(""),
});


// ── Compute overallScores from Agent5 data (not LLM-generated) ─────────────
function computeOverallScores(analyses: SectionAnalysis[]): OverallScores | undefined {
  if (!analyses?.length) return undefined;

  const allFindings = analyses.flatMap((sa) => sa.findings);
  if (!allFindings.length) return undefined;

  // Group scores by site label
  const scoresBySite = new Map<string, number[]>();
  for (const f of allFindings) {
    if (typeof f.score !== "number" || f.score < 0 || f.score > 1) continue;
    const existing = scoresBySite.get(f.site) ?? [];
    existing.push(f.score);
    scoresBySite.set(f.site, existing);
  }

  // If the input page produced no scored findings, returning { input: 0 } would show
  // a misleading "0" in the arc gauge. Return undefined so the UI hides the gauge instead.
  if (!scoresBySite.has("input")) return undefined;

  const avg = (nums: number[]) =>
    nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;

  const result: OverallScores = { input: avg(scoresBySite.get("input")!) };

  for (const [site, scores] of scoresBySite) {
    if (site === "input") continue;
    // Use competitor name as key (e.g. "competitor1", "competitor2", etc.)
    const competitorIndex = [...scoresBySite.keys()]
      .filter((k) => k !== "input")
      .indexOf(site);
    result[`competitor${competitorIndex + 1}`] = avg(scores);
  }

  return result;
}

export async function runSynthesis(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<{ recommendations: Recommendation[]; executiveSummary: string; overallScores?: OverallScores; sections: SectionAnalysis[] }> {
  if (!ctx.productBrief) {
    throw new AgentError("agent6", "productBrief is missing from pipeline context");
  }
  if (!ctx.competitors?.length) {
    throw new AgentError("agent6", "competitors is missing from pipeline context");
  }

  // ── Step 0: Filter and prioritize sections ─────────────────────
  // Only include sections present on the user's site (MVP: improve what exists).
  let workingAnalyses = (ctx.sectionAnalyses ?? []).filter((sa) =>
    sa.findings.some((f) => f.site === "input")
  );

  // Cap to top MAX_SYNTHESIS_SECTIONS by competitive gap magnitude.
  if (workingAnalyses.length > MAX_SYNTHESIS_SECTIONS) {
    const ranked = workingAnalyses
      .map((sa) => ({ sa, magnitude: computeGapMagnitude(sa) }))
      .sort((a, b) =>
        b.magnitude - a.magnitude || (a.sa.scrollFraction ?? 1) - (b.sa.scrollFraction ?? 1)
      );
    workingAnalyses = ranked
      .slice(0, MAX_SYNTHESIS_SECTIONS)
      .map((r) => r.sa)
      .sort((a, b) => (a.scrollFraction ?? 1) - (b.scrollFraction ?? 1));

    console.log(
      `[agent6] Capped sections from ${ctx.sectionAnalyses?.length ?? 0} to ${workingAnalyses.length} ` +
      `(types: ${workingAnalyses.map((s) => s.sectionType).join(", ")})`
    );
  }

  // ── Step 1: Build user message ─────────────────────────────────
  const hasSectionData = workingAnalyses.length > 0;

  // Strip raw score numbers from findings (the LLM quotes them verbatim).
  // Instead, compute per-section gap summaries so Agent 6 can prioritize
  // recommendations by actual competitive delta, not guesswork.
  const cap = (s: string | undefined, max: number) => s ? s.slice(0, max) : s;
  const sanitizedAnalyses = workingAnalyses.map((sa) => ({
    ...sa,
    // Strip scores, confidence; truncate strengths/weaknesses to top signal.
    // Truncate summary + evidence fields to reduce input tokens while keeping key signals.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    findings: sa.findings.map(({ scores: _s, score: _sc, confidence: _c, strengths, weaknesses, summary, evidence, ...rest }) => ({
      ...rest,
      summary: cap(summary, 200),
      evidence: {
        headlineText: cap(evidence.headlineText, 100),
        ctaText: cap(evidence.ctaText, 100),
        quote: cap(evidence.quote, 150),
        visualNote: cap(evidence.visualNote, 150),
      },
      strengths: strengths.slice(0, 1),
      weaknesses: weaknesses.slice(0, 1),
    })),
  }));

  // Build score gap context: for each section, identify axes where competitors
  // outperform the input most. Agent 6 uses this for priority classification.
  const scoreGaps = workingAnalyses.map((sa) => {
    const inputF = sa.findings.find((f) => f.site === "input");
    if (!inputF?.scores) return null;
    const compScores = sa.findings
      .filter((f) => f.site !== "input" && f.scores)
      .map((f) => f.scores!);
    if (!compScores.length) return null;
    const axes = Object.keys(inputF.scores) as (keyof typeof inputF.scores)[];
    const gaps = axes
      .map((axis) => {
        const best = Math.max(...compScores.map((s) => s[axis]));
        const gap = Math.round((best - inputF.scores![axis]) * 100) / 100;
        return { axis, gap };
      })
      .filter((g) => g.gap > 0.1)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);
    return gaps.length > 0 ? { section: sa.sectionType, gaps } : null;
  }).filter(Boolean);

  const recsPerSection = 2;

  const failedNote = ctx.failedUrls?.length
    ? `\n\nNOTE: The following competitor URLs could NOT be analyzed. Do NOT reference them as examples: ${ctx.failedUrls.join(", ")}`
    : "";

  const userMessage = [
    `PRODUCT: ${JSON.stringify(ctx.productBrief)}`,
    `COMPETITORS: ${JSON.stringify(ctx.competitors)}`,
    hasSectionData
      ? `SECTION ANALYSES: ${JSON.stringify(sanitizedAnalyses)}`
      : `SECTION ANALYSES: [] (visual analysis unavailable — base recommendations on product brief and competitor context only)`,
    scoreGaps.length > 0
      ? `SCORE GAPS (for priority weighting only — NEVER quote these in output text): ${JSON.stringify(scoreGaps)}`
      : "",
    `RECOMMENDATIONS_PER_SECTION: ${recsPerSection}`,
  ].filter(Boolean).join("\n\n") + failedNote;

  // ── Step 2: AI Gateway call (Flash → GPT-5.4 fallback) ───────────────────────
  // While the LLM works, reveal section chips one by one at 700 ms intervals.
  const sectionLabels = workingAnalyses.map((sa) =>
    sa.sectionType.replace(/([A-Z])/g, " $1").toLowerCase().trim()
  );
  const emitted: string[] = [];
  let labelIdx = 0;
  let stopped = false;
  const interval =
    onActions && sectionLabels.length > 0
      ? setInterval(() => {
          if (stopped) return;
          if (labelIdx < sectionLabels.length) {
            emitted.push(sectionLabels[labelIdx++]);
            onActions([...emitted]);
          }
        }, 700)
      : null;

  let raw: z.infer<typeof SynthesisSchema>;
  try {
    raw = await aiGenerateStructured(CHAINS.flash, {
      system: AGENT_PROMPTS.synthesis,
      prompt: userMessage,
      schema: SynthesisSchema,
    });
  } catch (err) {
    stopped = true;
    if (interval) clearInterval(interval);
    throw new AgentError(
      "agent6",
      `AI generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  stopped = true;
  if (interval) clearInterval(interval);

  // ── Step 3: Retry if LLM returned empty recommendations array ────
  // Transient failure: model returned valid JSON but empty array.
  // Retry once with a minimal prompt stripped of SECTION ANALYSES bulk.
  if (raw.recommendations.length === 0) {
    console.warn("[agent6] LLM returned empty recommendations — retrying with minimal prompt");
    const minimalMessage = [
      `PRODUCT: ${JSON.stringify(ctx.productBrief)}`,
      `COMPETITORS: ${JSON.stringify(ctx.competitors)}`,
      `SECTION ANALYSES: [] (retry — base recommendations on product brief and competitor context only)`,
    ].join("\n\n");
    try {
      const retryRaw = await aiGenerateStructured(CHAINS.flash, {
        system: AGENT_PROMPTS.synthesis,
        prompt: minimalMessage,
        schema: SynthesisSchema,
      });
      if (retryRaw.recommendations.length > 0) {
        raw = retryRaw;
        console.warn(`[agent6] Retry succeeded: ${raw.recommendations.length} recommendations`);
      } else {
        throw new AgentError("agent6", "LLM returned empty recommendations on both attempts — synthesis failed");
      }
    } catch (retryErr) {
      if (retryErr instanceof AgentError) throw retryErr;
      console.error("[agent6] Retry failed:", retryErr instanceof Error ? retryErr.message : String(retryErr));
      throw new AgentError("agent6", `Retry call failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
    }
  }

  // Determine expected sections from pipeline context
  const expectedSections = new Set(
    workingAnalyses.map((s) => s.sectionType)
  );

  // ── Step 4: Map to Recommendation[] with business-rule validation ──────
  // Zod schema guarantees field types; these checks enforce semantic correctness.
  const rawRecs = raw.recommendations;

  const recommendations = rawRecs.map((r, i) => {
    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError("agent6", `recommendations[${i}] has invalid priority: "${r.priority}"`);
    }
    const normalizedSection = normalizeSectionType(r.section);
    if (!VALID_SECTION_TYPES.has(normalizedSection as SectionType)) {
      console.warn(`[agent6] DROPPED recommendations[${i}]: section raw="${r.section}" normalized="${normalizedSection}" not in whitelist`);
      return null;
    }
    if (!r.title.trim() || !r.reasoning.trim() || !r.competitorExample.trim() || !r.suggestedAction.trim()) {
      throw new AgentError("agent6", `recommendations[${i}] has empty required field`);
    }
    // Validate forbidden openers in suggestedAction (prompt forbids these but LLMs slip)
    const FORBIDDEN_OPENERS = /^(Improve|Enhance|Optimize|Consider|Update|Refine|Redesign|Revamp|Rework|Address|Ensure)\b/i;
    if (FORBIDDEN_OPENERS.test(r.suggestedAction.trim())) {
      console.warn(`[agent6] recommendations[${i}] suggestedAction starts with forbidden opener: "${r.suggestedAction.slice(0, 40)}..."`);
    }
    // Validate competitorExample names a specific competitor, not generic references
    const competitorNames = ctx.competitors?.map((c) => c.name.toLowerCase()) ?? [];
    const mentionsCompetitor = competitorNames.some((name) => r.competitorExample.toLowerCase().includes(name));
    if (!mentionsCompetitor) {
      console.warn(`[agent6] recommendations[${i}] competitorExample doesn't name a known competitor: "${r.competitorExample.slice(0, 60)}..."`);
    }

    return {
      priority: r.priority as Priority,
      section: normalizedSection as SectionType,
      title: stripInlineCode(r.title),
      reasoning: stripInlineCode(r.reasoning),
      exampleFromCompetitor: stripInlineCode(r.competitorExample),
      suggestedAction: stripInlineCode(r.suggestedAction),
      impact: r.impact?.trim()
        ? stripInlineCode(r.impact.trim().split(/(?<=\.)\s/).slice(0, 2).join(" "))
        : undefined,
      confidence: r.confidence != null
        ? Math.max(0, Math.min(1, r.confidence > 1 ? Math.round((r.confidence / 10) * 100) / 100 : r.confidence))
        : undefined,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rawRecs.length > 0 && recommendations.length === 0) {
    console.error(
      `[agent6] All ${rawRecs.length} recommendations were filtered out. ` +
      `Raw section values: ${rawRecs.map((r) => r.section).join(", ")}`
    );
  }

  // Validate per-section counts — warn but don't throw for minor deviations
  if (expectedSections.size > 0) {
    const sectionCounts = new Map<string, number>();
    for (const rec of recommendations) {
      sectionCounts.set(rec.section, (sectionCounts.get(rec.section) ?? 0) + 1);
    }
    for (const section of expectedSections) {
      const count = sectionCounts.get(section) ?? 0;
      if (count === 0) {
        console.warn(`[agent6] Section "${section}" has 0 recommendations — expected ${recsPerSection}`);
      } else if (count < recsPerSection - 1) {
        console.warn(`[agent6] Section "${section}" has only ${count} recommendations — expected ${recsPerSection}`);
      }
    }
  }

  const executiveSummary = raw.executiveSummary?.trim()
    ? stripInlineCode(raw.executiveSummary.trim())
    : "";

  // Compute overallScores from ALL Agent5 sections (not just the capped subset).
  // The arc gauge should reflect the full page picture, not just the problem areas.
  const overallScores = computeOverallScores(
    (ctx.sectionAnalyses ?? []).filter((sa) => sa.findings.some((f) => f.site === "input"))
  );

  return { recommendations, executiveSummary, overallScores, sections: workingAnalyses };
}
