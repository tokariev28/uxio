import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
import { normalizeSectionType } from "@/lib/utils/normalize-section-type";
import { stripInlineCode } from "@/lib/utils/markdown-clean";
import type { PipelineContext, Recommendation, Priority, SectionType, OverallScores } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

const VALID_PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);
const VALID_SECTION_TYPES = new Set<SectionType>(["hero", "navigation", "features", "benefits", "socialProof", "testimonials", "integrations", "howItWorks", "pricing", "faq", "cta", "footer", "videoDemo", "comparison", "metrics"]);


// ── Compute overallScores from Agent5 data (not LLM-generated) ─────────────
function computeOverallScores(ctx: PipelineContext): OverallScores | undefined {
  const analyses = ctx.sectionAnalyses;
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
): Promise<{ recommendations: Recommendation[]; executiveSummary: string; overallScores?: OverallScores }> {
  if (!ctx.productBrief) {
    throw new AgentError("agent6", "productBrief is missing from pipeline context");
  }
  if (!ctx.competitors?.length) {
    throw new AgentError("agent6", "competitors is missing from pipeline context");
  }
  // ── Step 1: Build user message ─────────────────────────────────
  const hasSectionData = (ctx.sectionAnalyses?.length ?? 0) > 0;

  // Strip numerical scores from findings before passing to agent6.
  // Agent5 uses scores internally for self-consistency, but exposing raw numbers
  // to agent6 causes it to quote them verbatim in recommendation text.
  const sanitizedAnalyses = ctx.sectionAnalyses?.map((sa) => ({
    ...sa,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    findings: sa.findings.map(({ scores: _s, score: _sc, ...rest }) => rest),
  }));

  const userMessage = [
    `PRODUCT: ${JSON.stringify(ctx.productBrief)}`,
    `COMPETITORS: ${JSON.stringify(ctx.competitors)}`,
    hasSectionData
      ? `SECTION ANALYSES: ${JSON.stringify(sanitizedAnalyses)}`
      : `SECTION ANALYSES: [] (visual analysis unavailable — base recommendations on product brief and competitor context only)`,
  ].join("\n\n");

  // ── Step 2: AI Gateway call (Flash → GPT-5.4 fallback) ───────────────────────
  let rawText: string;
  try {
    rawText = await aiGenerate(CHAINS.flash, {
      system: AGENT_PROMPTS.synthesis,
      prompt: userMessage,
      json: true,
    });
  } catch (err) {
    throw new AgentError(
      "agent6",
      `AI generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Step 3: Parse JSON ─────────────────────────────────────────
  // Must be `let` so the retry block below can reassign on success
  let raw: { recommendations: unknown[]; executiveSummary?: unknown };
  try {
    raw = JSON.parse(extractJSON(rawText)) as typeof raw;
  } catch (err) {
    throw new AgentError(
      "agent6",
      `AI response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Step 5: Validate shape ─────────────────────────────────────
  if (!Array.isArray(raw?.recommendations)) {
    throw new AgentError("agent6", 'Response missing "recommendations" array');
  }

  // ── Step 5b: Retry if LLM returned empty recommendations array ────
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
      const retryText = await aiGenerate(CHAINS.flash, {
        system: AGENT_PROMPTS.synthesis,
        prompt: minimalMessage,
        json: true,
      });
      const retryRaw = JSON.parse(extractJSON(retryText)) as typeof raw;
      if (Array.isArray(retryRaw?.recommendations) && retryRaw.recommendations.length > 0) {
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
    (ctx.sectionAnalyses ?? []).map((s) => s.sectionType)
  );

  // ── Step 6: Map to Recommendation[] ───────────────────────────
  const rawRecs = raw.recommendations;

  const recommendations = rawRecs.map((item, i) => {
    const r = item as Record<string, unknown>;

    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid priority: "${r.priority}"`
      );
    }
    const normalizedSection = normalizeSectionType(r.section);
    if (!VALID_SECTION_TYPES.has(normalizedSection as SectionType)) {
      console.warn(
        `[agent6] DROPPED recommendations[${i}]: section raw="${r.section}" normalized="${normalizedSection}" not in whitelist`
      );
      return null;
    }
    for (const field of ["title", "reasoning", "competitorExample", "suggestedAction"] as const) {
      if (typeof r[field] !== "string" || !(r[field] as string).trim()) {
        throw new AgentError("agent6", `recommendations[${i}] missing or empty field: ${field}`);
      }
    }

    return {
      priority: r.priority as Priority,
      section: normalizedSection as SectionType,
      title: stripInlineCode(r.title as string),
      reasoning: stripInlineCode(r.reasoning as string),
      exampleFromCompetitor: stripInlineCode(r.competitorExample as string),
      suggestedAction: stripInlineCode(r.suggestedAction as string),
      impact:
        typeof r.impact === "string" && (r.impact as string).trim()
          ? stripInlineCode((r.impact as string).trim())
          : undefined,
      confidence:
        typeof r.confidence === "number" ? r.confidence : undefined,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rawRecs.length > 0 && recommendations.length === 0) {
    console.error(
      `[agent6] All ${rawRecs.length} recommendations were filtered out. ` +
      `Raw section values: ${rawRecs.map((r) => (r as Record<string, unknown>).section).join(", ")}`
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
        console.warn(`[agent6] Section "${section}" has 0 recommendations — expected 3`);
      } else if (count < 2) {
        console.warn(`[agent6] Section "${section}" has only ${count} recommendations — expected 3`);
      }
    }
  }

  const executiveSummary =
    typeof raw.executiveSummary === "string" && raw.executiveSummary.trim()
      ? stripInlineCode(raw.executiveSummary.trim())
      : "";

  // Compute overallScores programmatically from Agent5 section scores —
  // grounded in real data instead of LLM-generated numbers.
  const overallScores = computeOverallScores(ctx);

  return { recommendations, executiveSummary, overallScores };
}
