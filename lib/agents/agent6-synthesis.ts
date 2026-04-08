import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type { PipelineContext, Recommendation, Priority, SectionType, OverallScores } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { withGeminiRetry } from "@/lib/agents/gemini-retry";

const VALID_PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);
const VALID_SECTION_TYPES = new Set<SectionType>(["hero", "navigation", "features", "benefits", "socialProof", "testimonials", "integrations", "howItWorks", "pricing", "faq", "cta", "footer"]);

export async function runSynthesis(
  ctx: PipelineContext,
  onRetry?: (delaySeconds: number) => void
): Promise<{ recommendations: Recommendation[]; executiveSummary: string; overallScores?: OverallScores }> {
  if (!ctx.productBrief) {
    throw new AgentError("agent6", "productBrief is missing from pipeline context");
  }
  if (!ctx.competitors?.length) {
    throw new AgentError("agent6", "competitors is missing from pipeline context");
  }
  // ── Step 1: Build user message ─────────────────────────────────
  const hasSectionData = (ctx.sectionAnalyses?.length ?? 0) > 0;

  const userMessage = [
    `PRODUCT: ${JSON.stringify(ctx.productBrief)}`,
    `COMPETITORS: ${JSON.stringify(ctx.competitors)}`,
    hasSectionData
      ? `SECTION ANALYSES: ${JSON.stringify(ctx.sectionAnalyses)}`
      : `SECTION ANALYSES: [] (visual analysis unavailable — base recommendations on product brief and competitor context only)`,
  ].join("\n\n");

  // ── Step 2: Gemini Flash call ──────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent6_gemini,
    systemInstruction: AGENT_PROMPTS.synthesis,
  });

  let geminiResult: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    geminiResult = await withGeminiRetry(
      () => model.generateContent(userMessage),
      onRetry
    );
  } catch (err) {
    throw new AgentError(
      "agent6",
      `Gemini failed after all retries: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const rawText = geminiResult.response.text();

  // ── Step 3: Strip markdown fences ─────────────────────────────
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // ── Step 4: Parse JSON ─────────────────────────────────────────
  let raw: { recommendations: unknown[]; executiveSummary?: unknown; overallScores?: Record<string, unknown> };
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new AgentError(
      "agent6",
      `Gemini response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Step 5: Validate shape ─────────────────────────────────────
  if (!Array.isArray(raw?.recommendations)) {
    throw new AgentError("agent6", 'Response missing "recommendations" array');
  }
  if (raw.recommendations.length !== 5) {
    throw new AgentError(
      "agent6",
      `Expected exactly 5 recommendations, got ${raw.recommendations.length}`
    );
  }

  // ── Step 6: Map to Recommendation[] ───────────────────────────
  const recommendations = raw.recommendations.map((item, i) => {
    const r = item as Record<string, unknown>;

    if (!VALID_PRIORITIES.has(r.priority as Priority)) {
      throw new AgentError(
        "agent6",
        `recommendations[${i}] has invalid priority: "${r.priority}"`
      );
    }
    for (const field of ["title", "reasoning", "competitorExample", "suggestedAction"] as const) {
      if (typeof r[field] !== "string" || !(r[field] as string).trim()) {
        throw new AgentError("agent6", `recommendations[${i}] missing or empty field: ${field}`);
      }
    }

    return {
      priority: r.priority as Priority,
      section: VALID_SECTION_TYPES.has(r.section as SectionType)
        ? (r.section as SectionType)
        : undefined,
      title: r.title as string,
      reasoning: r.reasoning as string,
      exampleFromCompetitor: r.competitorExample as string,
      suggestedAction: r.suggestedAction as string,
    };
  });

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
