import type { PipelineContext, ProductBrief } from "@/lib/types/analysis";

export async function runPageIntelligence(
  ctx: PipelineContext
): Promise<ProductBrief> {
  // STUB: will be replaced with Firecrawl + Gemini in Phase 3
  await delay(500);

  return {
    company: "Apollo.io",
    industry: "Sales Intelligence / B2B Data",
    icp: "SDRs, AEs, Revenue teams at mid-market companies",
    icpKeyword: "",
    coreValueProp: "Find, contact, and close ideal buyers",
    cvpKeyword: "",
    keyFeatures: [
      "contact database",
      "email sequences",
      "dialer",
      "intent data",
    ],
    pricingModel: "Freemium + tiered plans",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
