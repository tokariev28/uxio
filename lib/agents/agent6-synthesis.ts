import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type { PipelineContext, Recommendation, Priority } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

const VALID_PRIORITIES = new Set<Priority>(["critical", "high", "medium"]);

export async function runSynthesis(
  ctx: PipelineContext,
  onRetry?: (delaySeconds: number) => void
): Promise<{ recommendations: Recommendation[]; executiveSummary: string }> {
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

  const delays = [30_000, 60_000];
  let geminiResult: Awaited<ReturnType<typeof model.generateContent>> | undefined;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      geminiResult = await model.generateContent(userMessage);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("too many requests");
      if (!is429) throw err;
      if (attempt < delays.length) {
        onRetry?.(delays[attempt] / 1000);
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }

  if (!geminiResult) {
    throw new AgentError(
      "agent6",
      "Rate limit exceeded. Consider upgrading to Gemini Pay-as-you-go."
    );
  }

  const rawText = geminiResult.response.text();

  // ── Step 3: Strip markdown fences ─────────────────────────────
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // ── Step 4: Parse JSON ─────────────────────────────────────────
  let raw: { recommendations: unknown[]; executiveSummary?: unknown };
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

  return { recommendations, executiveSummary };
}
