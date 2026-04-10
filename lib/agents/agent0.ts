import FirecrawlApp from "@mendable/firecrawl-js";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
import type { ProductBrief } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { isUsableMarkdown } from "@/lib/utils/scrape-quality";

export async function runAgent0(
  url: string,
  onActions?: (actions: string[]) => void
): Promise<ProductBrief> {
  // Emit the URL being scraped as a chip
  try {
    onActions?.([new URL(url).hostname.replace(/^www\./, "")]);
  } catch {
    onActions?.([url]);
  }

  // ── Step 1: Firecrawl scrape ────────────────────────────────────
  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });

  const scraped = await firecrawl.scrape(url, { formats: ["markdown"] });

  if (!isUsableMarkdown(scraped.markdown ?? "")) {
    throw new AgentError(
      "agent0",
      `Firecrawl returned unusable markdown for ${url} (${(scraped.markdown ?? "").length} chars). Page may require JavaScript rendering.`
    );
  }

  // ── Step 2: AI Gateway extraction (Flash-Lite → GPT-5.4 fallback) ───────────
  const rawText = await aiGenerate(CHAINS.flashLite, {
    system: AGENT_PROMPTS.pageIntelligence,
    prompt: scraped.markdown!,
    json: true,
  });

  // ── Step 3: Parse JSON ─────────────────────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(extractJSON(rawText));
  } catch (err) {
    throw new AgentError(
      "agent0",
      `Gemini response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── Step 4: Validate required fields ──────────────────────────
  for (const field of ["company", "industry", "icp", "coreValueProp"] as const) {
    if (typeof raw[field] !== "string" || !(raw[field] as string).trim()) {
      throw new AgentError("agent0", `Missing or empty required field: ${field}`);
    }
  }
  if (!Array.isArray(raw.keyFeatures)) {
    throw new AgentError("agent0", "Missing or invalid field: keyFeatures");
  }

  // ── Step 5: Map to ProductBrief ────────────────────────────────
  return {
    company: raw.company as string,
    industry: raw.industry as string,
    icp: raw.icp as string,
    icpKeyword: typeof raw.icpKeyword === "string" ? raw.icpKeyword : "",
    coreValueProp: raw.coreValueProp as string,
    cvpKeyword: typeof raw.cvpKeyword === "string" ? raw.cvpKeyword : "",
    keyFeatures: (raw.keyFeatures as unknown[]).filter(
      (f): f is string => typeof f === "string"
    ),
    pricingModel:
      typeof raw.pricingModel === "string" ? raw.pricingModel : undefined,
    primaryCTAText:
      typeof raw.primaryCTAText === "string" ? raw.primaryCTAText : undefined,
    pricingVisible:
      typeof raw.pricingVisible === "boolean" ? raw.pricingVisible : undefined,
    hasFreeTrialOrFreemium:
      typeof raw.hasFreeTrialOrFreemium === "boolean"
        ? raw.hasFreeTrialOrFreemium
        : undefined,
  };
}
