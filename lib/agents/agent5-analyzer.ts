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

interface GeminiVisionResponse {
  sectionType: string;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  keyEvidence: {
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
  screenshotBase64: string,
  ctx: PipelineContext,
  sectionType: string
): Promise<GeminiVisionResponse> {
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent5_gemini,
    systemInstruction: AGENT_PROMPTS.visionAnalyzer,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: `TARGET ICP: ${ctx.productBrief!.icp}\nSECTION TYPE: ${sectionType}\n\nMARKDOWN:\n${markdownSlice}` },
          { inlineData: { mimeType: "image/png", data: screenshotBase64 } },
        ],
      },
    ],
  });

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

  const deepSections = pageSections.sections.filter((s) => s.needsDeepVision);

  // Resolve once per page: Firecrawl may return a signed GCS URL instead of base64
  const screenshotData = page.screenshotBase64!.startsWith("http")
    ? await urlToBase64(page.screenshotBase64!)
    : page.screenshotBase64!;

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
          summary: raw.strengths[0] ?? raw.weaknesses[0] ?? "No notable findings",
          evidence: {
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
  ctx: PipelineContext
): Promise<SectionAnalysis[]> {
  if (!ctx.pages?.length) {
    throw new AgentError("agent5", "pages is missing from pipeline context");
  }
  if (!ctx.pageSections?.length) {
    throw new AgentError("agent5", "pageSections is missing from pipeline context");
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
