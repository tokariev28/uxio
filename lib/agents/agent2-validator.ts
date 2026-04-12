import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import type { PipelineContext, Competitor } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { getHostname, getHostnameOrEmpty } from "@/lib/utils/url";

// ── Zod schema for structured output ─────────────────────────────────────
const CompetitorResultSchema = z.object({
  competitors: z.array(z.object({
    url: z.string(),
    name: z.string(),
    matchScore: z.number(),
    matchReason: z.string(),
  })).min(3),
});

export async function runValidator(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<Competitor[]> {
  const { productBrief, candidates } = ctx;

  if (!productBrief) {
    throw new AgentError("agent2", "productBrief is missing from pipeline context");
  }
  if (!candidates?.length) {
    throw new AgentError("agent2", "candidates is empty or missing from pipeline context");
  }

  // Emit candidate domains as chips (cap at 8 to avoid overflow)
  const candidateDomains = candidates.slice(0, 8).map((c) => getHostname(c.url) || c.name);
  onActions?.(candidateDomains);

  // ── Step 1: Build user message ─────────────────────────────────
  const userMessage = `PRODUCT BRIEF:\n${JSON.stringify(productBrief, null, 2)}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 2)}`;

  // ── Step 2: Structured AI call (schema-validated) ──────────────
  let raw: z.infer<typeof CompetitorResultSchema>;
  try {
    raw = await aiGenerateStructured(CHAINS.flashLite, {
      system: AGENT_PROMPTS.competitorValidator,
      prompt: userMessage,
      schema: CompetitorResultSchema,
    });
  } catch (err) {
    throw new AgentError(
      "agent2",
      `AI validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Accept 3–5: top 3 = primary, positions 4–5 = backup fallbacks for agent3
  const validatedPool = raw.competitors.slice(0, 5);

  // Build candidate domain set for URL validation
  const candidateDomainSet = new Set(
    candidates.map((c) => getHostnameOrEmpty(c.url)).filter(Boolean)
  );

  const competitors: Competitor[] = validatedPool.map((c, i) => {
    // Normalize matchScore to 0–1 range (LLM sometimes returns 0–100 scale)
    let score = c.matchScore;
    if (score > 1) score = score / 100;
    if (score < 0 || score > 1) {
      throw new AgentError("agent2", `competitors[${i}] matchScore out of range: ${score}`);
    }

    // Validate that competitor URL exists among original candidates (by domain)
    const competitorDomain = getHostnameOrEmpty(c.url);
    if (!competitorDomain) {
      throw new AgentError("agent2", `competitors[${i}] has invalid URL: ${c.url}`);
    }
    if (!candidateDomainSet.has(competitorDomain)) {
      console.warn(`[agent2] LLM returned URL not in candidates: ${c.url} — skipping`);
      return null;
    }

    return {
      url: c.url,
      name: c.name,
      matchScore: score,
      matchReason: c.matchReason,
    };
  }).filter((c): c is Competitor => c !== null);

  if (competitors.length < 3) {
    throw new AgentError(
      "agent2",
      `Only ${competitors.length} competitors matched candidate URLs (need at least 3)`
    );
  }

  return competitors;
}
