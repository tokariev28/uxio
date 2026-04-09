import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
import type { PipelineContext, Recommendation, Priority, SectionType, OverallScores } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

const VALID_PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);
const VALID_SECTION_TYPES = new Set<SectionType>(["hero", "navigation", "features", "benefits", "socialProof", "testimonials", "integrations", "howItWorks", "pricing", "faq", "cta", "footer"]);

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
  let raw: { recommendations: unknown[]; executiveSummary?: unknown; overallScores?: Record<string, unknown> };
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
  const recommendations = raw.recommendations.map((item, i) => {
    const r = item as Record<string, unknown>;

    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid priority: "${r.priority}"`
      );
    }
    if (!VALID_SECTION_TYPES.has(r.section as SectionType)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid or missing section: "${r.section}"`
      );
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
    };
  });

  // Validate per-section counts — warn but don't throw for minor deviations
  if (expectedSections.size > 0) {
    const sectionCounts = new Map<string, number>();
    for (const rec of recommendations) {
      sectionCounts.set(rec.section, (sectionCounts.get(rec.section) ?? 0) + 1);
    }
    for (const section of expectedSections) {
      const count = sectionCounts.get(section) ?? 0;
      if (count === 0) {
        console.warn(`[agent6] Section "${section}" has 0 recommendations — expected 5`);
      } else if (count < 3) {
        console.warn(`[agent6] Section "${section}" has only ${count} recommendations — expected 5`);
      }
    }
  }

  const executiveSummary =
    typeof raw.executiveSummary === "string" && raw.executiveSummary.trim()
      ? raw.executiveSummary.trim()
      : "";

  // Extract overallScores if present (prompt requests input + competitor scores)
  let overallScores: OverallScores | undefined;
  if (raw.overallScores && typeof raw.overallScores === "object") {
    const allNumeric = Object.values(raw.overallScores).every((v) => typeof v === "number");
    if (allNumeric) {
      overallScores = raw.overallScores as unknown as OverallScores;
    }
  }

  return { recommendations, executiveSummary, overallScores };
}
