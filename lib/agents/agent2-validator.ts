import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
import type { PipelineContext, Competitor } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

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
  const candidateDomains = candidates.slice(0, 8).map((c) => {
    try {
      return new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      return c.name;
    }
  });
  onActions?.(candidateDomains);

  // ── Step 1: Build user message ─────────────────────────────────
  const userMessage = `PRODUCT BRIEF:\n${JSON.stringify(productBrief, null, 2)}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 2)}`;

  // ── Step 2: AI Gateway call (Flash-Lite → GPT-5.4 fallback) ──────────────────
  const rawText = await aiGenerate(CHAINS.flashLite, {
    system: AGENT_PROMPTS.competitorValidator,
    prompt: userMessage,
    json: true,
  });

  // ── Step 3: Parse JSON ─────────────────────────────────────────
  let raw: { competitors: unknown[] };
  try {
    raw = JSON.parse(extractJSON(rawText));
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
  if (raw.competitors.length < 3) {
    throw new AgentError(
      "agent2",
      `Expected at least 3 competitors, got ${raw.competitors.length}`
    );
  }

  // Accept 3–5: top 3 = primary, positions 4–5 = backup fallbacks for agent3
  const validatedPool = raw.competitors.slice(0, 5);

  // Build candidate domain set for URL validation
  const candidateDomainSet = new Set(
    candidates.map((c) => {
      try { return new URL(c.url).hostname.replace(/^www\./, ""); } catch { return ""; }
    }).filter(Boolean)
  );

  const competitors: Competitor[] = validatedPool.map((item, i) => {
    const c = item as Record<string, unknown>;
    for (const field of ["url", "name", "matchReason"] as const) {
      if (typeof c[field] !== "string" || !(c[field] as string).trim()) {
        throw new AgentError("agent2", `competitors[${i}] missing or empty field: ${field}`);
      }
    }
    if (typeof c.matchScore !== "number") {
      throw new AgentError("agent2", `competitors[${i}] matchScore must be a number`);
    }
    // Normalize matchScore to 0–1 range (LLM sometimes returns 0–100 scale)
    if ((c.matchScore as number) > 1) {
      c.matchScore = (c.matchScore as number) / 100;
    }
    if ((c.matchScore as number) < 0 || (c.matchScore as number) > 1) {
      throw new AgentError("agent2", `competitors[${i}] matchScore out of range: ${c.matchScore}`);
    }
    // Validate that competitor URL exists among original candidates (by domain)
    let competitorDomain: string;
    try {
      competitorDomain = new URL(c.url as string).hostname.replace(/^www\./, "");
    } catch {
      throw new AgentError("agent2", `competitors[${i}] has invalid URL: ${c.url}`);
    }
    if (!candidateDomainSet.has(competitorDomain)) {
      console.warn(`[agent2] LLM returned URL not in candidates: ${c.url} — skipping`);
      return null;
    }

    return {
      url: c.url as string,
      name: c.name as string,
      matchScore: c.matchScore as number,
      matchReason: c.matchReason as string,
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
