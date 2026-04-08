import { GoogleGenerativeAI } from "@google/generative-ai";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type {
  PipelineContext,
  PageSections,
  ClassifiedSection,
  SectionType,
} from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { withGeminiRetry } from "@/lib/agents/gemini-retry";

const VALID_SECTION_TYPES = new Set<SectionType>([
  "hero",
  "navigation",
  "features",
  "benefits",
  "socialProof",
  "testimonials",
  "integrations",
  "howItWorks",
  "pricing",
  "faq",
  "cta",
  "footer",
]);

async function classifyPage(
  genAI: GoogleGenerativeAI,
  url: string,
  markdown: string
): Promise<PageSections> {
  const model = genAI.getGenerativeModel({
    model: AGENT_MODELS.agent4_gemini,
    systemInstruction: AGENT_PROMPTS.sectionClassifier,
  });

  const geminiResult = await withGeminiRetry(() => model.generateContent(markdown));
  const rawText = geminiResult.response.text();

  const text = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let raw: { sections: unknown[] };
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new AgentError(
      "agent4",
      `Gemini response is not valid JSON for ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(raw?.sections)) {
    throw new AgentError("agent4", `Response missing "sections" array for ${url}`);
  }

  const sections: ClassifiedSection[] = raw.sections
    .filter((item) => {
      const s = item as Record<string, unknown>;
      return VALID_SECTION_TYPES.has(s.type as SectionType);
    })
    .map((item) => {
      const s = item as Record<string, unknown>;
      const start = typeof s.startChar === "number" ? s.startChar : 0;
      const end = typeof s.endChar === "number" ? s.endChar : markdown.length;
      return {
        type: s.type as SectionType,
        markdownSlice: markdown.slice(start, end),
      };
    });

  return { url, sections };
}

export async function runClassifier(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<PageSections[]> {
  if (!ctx.pages?.length) {
    throw new AgentError("agent4", "pages is missing from pipeline context");
  }

  // Emit all page domains being classified (input URL + competitors)
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

  const results = await Promise.allSettled(
    ctx.pages.map((page) => {
      if (!page.markdown) {
        return Promise.resolve<PageSections>({ url: page.url, sections: [] });
      }
      return classifyPage(genAI, page.url, page.markdown);
    })
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    console.error(
      `[agent4] Failed to classify ${ctx.pages![i].url}:`,
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason)
    );
    return { url: ctx.pages![i].url, sections: [] };
  });
}
