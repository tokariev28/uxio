import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type { PipelineContext, Competitor } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

export async function runValidator(
  ctx: PipelineContext
): Promise<Competitor[]> {
  const { productBrief, candidates } = ctx;

  if (!productBrief) {
    throw new AgentError("agent2", "productBrief is missing from pipeline context");
  }
  if (!candidates?.length) {
    throw new AgentError("agent2", "candidates is empty or missing from pipeline context");
  }

  // ── Step 1: Build user message ─────────────────────────────────
  const userMessage = `PRODUCT BRIEF:\n${JSON.stringify(productBrief, null, 2)}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 2)}`;

  // ── Step 2: Gemini Flash-Lite call ─────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent2_gemini,
    systemInstruction: AGENT_PROMPTS.competitorValidator,
  });

  const geminiResult = await model.generateContent(userMessage);
  const rawText = geminiResult.response.text();

  // ── Step 3: Strip markdown fences ─────────────────────────────
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // ── Step 4: Parse JSON ─────────────────────────────────────────
  let raw: { competitors: unknown[] };
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new AgentError(
      "agent2",
      `Gemini response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Step 5: Validate shape ─────────────────────────────────────
  if (!Array.isArray(raw?.competitors)) {
    throw new AgentError("agent2", 'Response missing "competitors" array');
  }
  if (raw.competitors.length !== 3) {
    throw new AgentError(
      "agent2",
      `Expected exactly 3 competitors, got ${raw.competitors.length}`
    );
  }

  const competitors: Competitor[] = raw.competitors.map((item, i) => {
    const c = item as Record<string, unknown>;
    for (const field of ["url", "name", "matchReason"] as const) {
      if (typeof c[field] !== "string" || !(c[field] as string).trim()) {
        throw new AgentError("agent2", `competitors[${i}] missing or empty field: ${field}`);
      }
    }
    if (typeof c.matchScore !== "number") {
      throw new AgentError("agent2", `competitors[${i}] matchScore must be a number`);
    }
    return {
      url: c.url as string,
      name: c.name as string,
      matchScore: c.matchScore as number,
      matchReason: c.matchReason as string,
    };
  });

  return competitors;
}
