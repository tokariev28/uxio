import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type {
  PipelineContext,
  SectionAnalysis,
  SectionFinding,
  SectionType,
  PageData,
  PageSections,
} from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { withGeminiRetry } from "@/lib/agents/gemini-retry";

interface GeminiVisionResponse {
  sectionType: string;
  scores?: {
    clarity: number;
    specificity: number;
    icpFit: number;
    visualHierarchy: number;
    conversionReadiness: number;
    trustSignals: number;
  };
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  keyEvidence: {
    headlineText: string | null;
    ctaText: string | null;
    copyQuote: string | null;
    visualObservation: string;
  };
}

function siteLabel(
  url: string,
  inputUrl: string,
  competitors: Array<{ url: string; name: string }>
): string {
  if (url === inputUrl) return "input";
  return competitors.find((c) => c.url === url)?.name ?? url;
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Screenshot fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function analyzeSection(
  genAI: GoogleGenerativeAI,
  markdownSlice: string,
  screenshotBase64: string | null,
  ctx: PipelineContext,
  sectionType: string
): Promise<GeminiVisionResponse> {
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent5_gemini,
    systemInstruction: AGENT_PROMPTS.visionAnalyzer,
  });

  const textPart = { text: `TARGET ICP: ${ctx.productBrief!.icp}\nSECTION TYPE: ${sectionType}\n\nMARKDOWN:\n${markdownSlice}` };
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [textPart];
  if (screenshotBase64) {
    parts.push({ inlineData: { mimeType: "image/png", data: screenshotBase64 } });
  }

  const result = await withGeminiRetry(() =>
    model.generateContent({
      contents: [{ role: "user", parts }],
    })
  );

  const rawText = result.response.text();
  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(text) as GeminiVisionResponse;
}

async function analyzePage(
  genAI: GoogleGenerativeAI,
  page: PageData,
  pageSections: PageSections,
  site: string,
  analysisMap: Map<SectionType, SectionAnalysis>,
  ctx: PipelineContext
): Promise<void> {
  if (!ctx.productBrief) return;

  const deepSections = pageSections.sections;

  // Resolve to raw base64 — handles GCS URL, raw base64, or existing data URI
  const rawSrc = page.screenshotBase64!;
  let screenshotData: string | null = null;

  try {
    if (rawSrc.startsWith("http")) {
      screenshotData = await urlToBase64(rawSrc);
    } else if (rawSrc.startsWith("data:")) {
      screenshotData = rawSrc.split(",")[1] ?? rawSrc;
    } else {
      screenshotData = rawSrc;
    }
    // Write back as a stable data URI so the frontend can display it
    // (GCS signed URLs expire in ~30 min; base64 data URIs never do)
    page.screenshotBase64 = `data:image/png;base64,${screenshotData}`;
  } catch (err) {
    console.warn(
      `[agent5] Screenshot fetch failed for ${page.url}, continuing with text-only analysis:`,
      err instanceof Error ? err.message : String(err)
    );
    // Keep original URL — it may still be valid for frontend display
  }

  await Promise.allSettled(
    deepSections.map(async (section) => {
      try {
        const raw = await analyzeSection(
          genAI,
          section.markdownSlice,
          screenshotData,
          ctx,
          section.type
        );

        const finding: SectionFinding = {
          site,
          score: raw.overallScore,
          scores: raw.scores ?? undefined,
          strengths: raw.strengths ?? [],
          weaknesses: raw.weaknesses ?? [],
          summary: raw.strengths[0] ?? raw.weaknesses[0] ?? "No notable findings",
          evidence: {
            headlineText: raw.keyEvidence.headlineText ?? undefined,
            ctaText: raw.keyEvidence.ctaText ?? undefined,
            quote: raw.keyEvidence.copyQuote ?? undefined,
            visualNote: raw.keyEvidence.visualObservation,
          },
        };

        if (!analysisMap.has(section.type)) {
          analysisMap.set(section.type, { sectionType: section.type, findings: [] });
        }
        analysisMap.get(section.type)!.findings.push(finding);
      } catch (err) {
        console.error(
          `[agent5] Failed to analyze "${section.type}" for ${page.url}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    })
  );
}

export async function runAnalyzer(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<SectionAnalysis[]> {
  if (!ctx.pages?.length) {
    throw new AgentError("agent5", "pages is missing from pipeline context");
  }
  if (!ctx.pageSections?.length) {
    throw new AgentError("agent5", "pageSections is missing from pipeline context");
  }

  // Emit all page domains being analyzed (input URL + competitors)
  if (ctx.pages?.length) {
    const domains = ctx.pages.map((p) => {
      try {
        return new URL(p.url).hostname.replace(/^www\./, "");
      } catch {
        return p.url;
      }
    });
    onActions?.(domains);
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  const competitors = ctx.competitors ?? [];
  const analysisMap = new Map<SectionType, SectionAnalysis>();

  await Promise.allSettled(
    ctx.pages.map(async (page, i) => {
      if (!page.screenshotBase64) return;

      const pageSections = ctx.pageSections![i];
      if (!pageSections) return;

      const site = siteLabel(page.url, ctx.inputUrl, competitors);
      await analyzePage(genAI, page, pageSections, site, analysisMap, ctx);
    })
  );

  return Array.from(analysisMap.values());
}
