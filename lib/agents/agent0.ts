import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import type { ProductBrief } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { isUsableMarkdown } from "@/lib/utils/scrape-quality";

// ── Zod schema for structured output ─────────────────────────────────────
// AI SDK validates the LLM response against this schema automatically.
// No manual JSON.parse / extractJSON / field validation needed.
const ProductBriefSchema = z.object({
  company: z.string(),
  industry: z.string(),
  icp: z.string(),
  icpKeyword: z.string().optional().default(""),
  coreValueProp: z.string(),
  cvpKeyword: z.string().optional().default(""),
  keyFeatures: z.array(z.string()).min(1),
  pricingModel: z.string().optional(),
  primaryCTAText: z.string().optional(),
  pricingVisible: z.boolean().optional(),
  hasFreeTrialOrFreemium: z.boolean().optional(),
});

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

  // ── Step 2: Structured AI extraction (schema-validated) ─────────
  try {
    const brief = await aiGenerateStructured(CHAINS.flashLite, {
      system: AGENT_PROMPTS.pageIntelligence,
      prompt: scraped.markdown!,
      schema: ProductBriefSchema,
    });

    // Filter empty keyFeatures strings (Zod min(1) ensures array is non-empty)
    const validFeatures = brief.keyFeatures.filter((f) => f.trim().length > 0);
    if (validFeatures.length === 0) {
      throw new AgentError("agent0", "keyFeatures array contains only empty strings");
    }

    return {
      ...brief,
      keyFeatures: validFeatures,
      icpKeyword: brief.icpKeyword ?? "",
      cvpKeyword: brief.cvpKeyword ?? "",
    };
  } catch (err) {
    if (err instanceof AgentError) throw err;
    throw new AgentError(
      "agent0",
      `AI extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
