import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
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

  const avg = (nums: number[]) =>
    nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;

  const result: OverallScores = { input: 0 };

  for (const [site, scores] of scoresBySite) {
    if (site === "input") {
      result.input = avg(scores);
    } else {
      // Use competitor name as key (e.g. "competitor1", "competitor2", etc.)
      const competitorIndex = [...scoresBySite.keys()]
        .filter((k) => k !== "input")
        .indexOf(site);
      result[`competitor${competitorIndex + 1}`] = avg(scores);
    }
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

  // Determine expected sections from pipeline context
  const expectedSections = new Set(
    (ctx.sectionAnalyses ?? []).map((s) => s.sectionType)
  );

  // ── Step 6: Map to Recommendation[] ───────────────────────────
  const rawRecs = raw.recommendations;
  console.log(`[agent6] LLM returned ${rawRecs.length} raw recommendations`);
  if (rawRecs.length > 0) {
    const sampleSections = rawRecs.slice(0, 3).map((r) => (r as Record<string, unknown>).section);
    console.log(`[agent6] First 3 section values from LLM:`, sampleSections);
  }

  const recommendations = rawRecs.map((item, i) => {
    const r = item as Record<string, unknown>;

    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid priority: "${r.priority}"`
      );
    }
    if (!VALID_SECTION_TYPES.has(r.section as SectionType)) {
      console.warn(
        `[agent6] DROPPED recommendations[${i}]: section="${r.section}" not in whitelist ` +
        `(priority="${r.priority}", title="${r.title}")`
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
      section: r.section as SectionType,
      title: r.title as string,
      reasoning: r.reasoning as string,
      exampleFromCompetitor: r.competitorExample as string,
      suggestedAction: r.suggestedAction as string,
      impact:
        typeof r.impact === "string" && (r.impact as string).trim()
          ? (r.impact as string).trim()
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
      ? raw.executiveSummary.trim()
      : "";

  // Compute overallScores programmatically from Agent5 section scores —
  // grounded in real data instead of LLM-generated numbers.
  const overallScores = computeOverallScores(ctx);

  return { recommendations, executiveSummary, overallScores };
}
