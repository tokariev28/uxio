import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import type { ProductBrief, PageData } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { isUsableMarkdown } from "@/lib/utils/scrape-quality";
import { getHostname } from "@/lib/utils/url";
import { env } from "@/lib/env";

// ── Zod schema for structured output ─────────────────────────────────────
// AI SDK validates the LLM response against this schema automatically.
// No manual JSON.parse / extractJSON / field validation needed.
const ProductBriefSchema = z.object({
  company: z.string(),
  industry: z.string(),
  icp: z.string(),
  icpKeyword: z.string().optional().default("").describe(
    "2-3 word search keyword for ideal customer profile. Always infer even if page is vague. Examples: 'AI developers', 'SMB sales teams', 'enterprise marketers', 'engineering teams', 'startup founders'"
  ),
  coreValueProp: z.string(),
  cvpKeyword: z.string().optional().default("").describe(
    "2-3 word search keyword for core value proposition category. Always infer from headline/CTA. Examples: 'AI models API', 'sales intelligence', 'project management', 'CRM', 'email marketing'"
  ),
  keyFeatures: z.array(z.string()).min(1),
  productCategory: z.enum(["vcs", "modelHub", "consumerAI", "orchestration", "docsWiki", "other"]).describe(
    "Which G2 primary category bucket best fits this product? " +
    "vcs = version control / code hosting (GitHub, GitLab). " +
    "modelHub = ML model sharing / dataset hub (Hugging Face, Kaggle). " +
    "consumerAI = consumer-facing AI chatbot or AI search (Character.ai, Perplexity). " +
    "orchestration = LLM orchestration framework / agent library (LangChain, LlamaIndex). " +
    "docsWiki = documentation platform / team wiki / knowledge base (Notion, Confluence, Slab). " +
    "other = everything else (CRM, PM, analytics, email, payments, design, etc.)."
  ),
  pricingModel: z.string().optional(),
  primaryCTAText: z.string().optional(),
  pricingVisible: z.boolean().optional(),
  hasFreeTrialOrFreemium: z.boolean().optional(),
});

// 90s for first pass, 120s for retry (waitFor: 8000 needs extra headroom).
// Matches Agent 3 timeouts for consistency.
const SCRAPE_TIMEOUT_MS = 90_000;
const SCRAPE_RETRY_TIMEOUT_MS = 120_000;
// Same TTL as AnalysisForm.tsx localStorage cache — Firecrawl won't serve data older than 2 hours.
const FIRECRAWL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function runAgent0(
  url: string,
  onActions?: (actions: string[]) => void
): Promise<{ brief: ProductBrief; pageData: PageData }> {
  // Emit the URL being scraped as a chip
  onActions?.([getHostname(url)]);

  // ── Step 1: Firecrawl scrape (two-pass for JS SPAs) ──────────────
  // Request screenshot too — Agent 3 reuses this scrape data to avoid a duplicate Firecrawl call.
  const firecrawl = new FirecrawlApp({
    apiKey: env().FIRECRAWL_API_KEY,
  });

  let scraped = await firecrawl.scrape(url, {
    formats: ["markdown", "screenshot"],
    timeout: SCRAPE_TIMEOUT_MS,
    maxAge: FIRECRAWL_MAX_AGE_MS,
  });

  // If content is thin (JS SPA not yet hydrated), retry with a wait.
  if (!isUsableMarkdown(scraped.markdown ?? "")) {
    console.warn(
      `[agent0] ${url}: thin content (${(scraped.markdown ?? "").length} chars) — retrying with waitFor: 8000ms`
    );
    const retry = await firecrawl.scrape(url, {
      formats: ["markdown", "screenshot"],
      timeout: SCRAPE_RETRY_TIMEOUT_MS,
      maxAge: FIRECRAWL_MAX_AGE_MS,
      waitFor: 8000,
    });
    if ((retry.markdown?.length ?? 0) >= (scraped.markdown?.length ?? 0)) {
      scraped = retry;
    }
  }

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

    // ── Fallback: derive keywords from other fields if LLM left them empty ──
    // icpKeyword ← first 3 substantive words from icp field
    let icpKeyword = brief.icpKeyword?.trim() || "";
    if (!icpKeyword && brief.icp) {
      const STOP = new Set(["and", "or", "the", "a", "an", "for", "to", "in", "on", "with", "of", "who", "that", "focused", "looking", "seeking", "interested"]);
      const words = brief.icp.split(/[\s,]+/).filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
      icpKeyword = words.slice(0, 3).join(" ");
    }

    // cvpKeyword ← industry (already a standardized short category)
    let cvpKeyword = brief.cvpKeyword?.trim() || "";
    if (!cvpKeyword && brief.industry) {
      cvpKeyword = brief.industry.toLowerCase();
    }

    const productBrief: ProductBrief = {
      ...brief,
      keyFeatures: validFeatures,
      icpKeyword,
      cvpKeyword,
    };

    const pageData: PageData = {
      url,
      markdown: scraped.markdown!,
      screenshotBase64: scraped.screenshot,
    };

    return { brief: productBrief, pageData };
  } catch (err) {
    if (err instanceof AgentError) throw err;
    throw new AgentError(
      "agent0",
      `AI extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
