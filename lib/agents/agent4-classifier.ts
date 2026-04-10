import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerate, CHAINS } from "@/lib/ai/gateway";
import { extractJSON } from "@/lib/utils/json-extract";
import { normalizeSectionType } from "@/lib/utils/normalize-section-type";
import { stripMarkdownLinks } from "@/lib/utils/markdown-clean";
import type {
  PipelineContext,
  PageSections,
  ClassifiedSection,
  SectionType,
} from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

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
  "videoDemo",
  "comparison",
  "metrics",
]);

async function classifyPage(
  url: string,
  markdown: string
): Promise<PageSections> {
  // Strip markdown links + bare URLs before sending to LLM.
  // Long tracking URLs (100-200 chars each) cause the LLM's startChar/endChar
  // estimates to drift by hundreds of positions, producing slices that land
  // inside URL query strings instead of actual page content.
  const cleanMd = stripMarkdownLinks(markdown);

  const rawText = await aiGenerate(CHAINS.flashLite, {
    system: AGENT_PROMPTS.sectionClassifier,
    prompt: cleanMd,
    json: true,
  });

  let raw: { sections: unknown[] };
  try {
    raw = JSON.parse(extractJSON(rawText));
  } catch (err) {
    throw new AgentError(
      "agent4",
      `AI response is not valid JSON for ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(raw?.sections)) {
    throw new AgentError("agent4", `Response missing "sections" array for ${url}`);
  }

  const seen = new Set<SectionType>();
  const sections: ClassifiedSection[] = raw.sections
    .map((item) => {
      const s = item as Record<string, unknown>;
      const start = typeof s.startChar === "number" ? s.startChar : 0;
      const end = typeof s.endChar === "number" ? s.endChar : cleanMd.length;
      return {
        type: normalizeSectionType(s.type) as SectionType,
        markdownSlice: cleanMd.slice(start, end),
        scrollFraction: cleanMd.length > 0 ? start / cleanMd.length : 0,
      };
    })
    .filter((s) => VALID_SECTION_TYPES.has(s.type))
    // Deduplicate by type — keep first occurrence (earliest in page)
    .filter((s) => {
      if (seen.has(s.type)) return false;
      seen.add(s.type);
      return true;
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

  const results = await Promise.allSettled(
    ctx.pages.map((page) => {
      if (!page.markdown) {
        return Promise.resolve<PageSections>({ url: page.url, sections: [] });
      }
      return classifyPage(page.url, page.markdown);
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
