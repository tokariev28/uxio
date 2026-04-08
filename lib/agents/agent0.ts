import FirecrawlApp from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type { ProductBrief } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { withGeminiRetry } from "@/lib/agents/gemini-retry";

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

  if (!scraped.markdown) {
    throw new AgentError(
      "agent0",
      `Firecrawl returned no markdown for ${url}`
    );
  }

  // ── Step 2: Gemini Flash-Lite extraction ───────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent0_gemini,
    systemInstruction: AGENT_PROMPTS.pageIntelligence,
  });

  const geminiResult = await withGeminiRetry(() => model.generateContent(scraped.markdown!));
  const rawText = geminiResult.response.text();

  // Strip markdown fences in case the model wraps the JSON despite instructions
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // ── Step 3: Parse JSON ─────────────────────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
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
