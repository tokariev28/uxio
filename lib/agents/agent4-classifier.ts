import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateStructured, CHAINS } from "@/lib/ai/gateway";
import { normalizeSectionType } from "@/lib/utils/normalize-section-type";
import { stripMarkdownLinks, stripBoilerplate } from "@/lib/utils/markdown-clean";
import type {
  PipelineContext,
  PageSections,
  ClassifiedSection,
  SectionType,
} from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { getHostname } from "@/lib/utils/url";
import { VALID_SECTION_TYPES } from "@/lib/constants";

// ── Zod schema for structured output ─────────────────────────────────────
const SectionClassificationSchema = z.object({
  sections: z.array(z.object({
    type: z.string(),
    startChar: z.number().optional().default(0),
    endChar: z.number().optional(),
    summary: z.string().optional(),
  })),
});

async function classifyPage(
  url: string,
  markdown: string
): Promise<PageSections> {
  // Strip markdown links + bare URLs before sending to LLM.
  // Long tracking URLs (100-200 chars each) cause the LLM's startChar/endChar
  // estimates to drift by hundreds of positions, producing slices that land
  // inside URL query strings instead of actual page content.
  const cleanMd = stripBoilerplate(stripMarkdownLinks(markdown));

  const raw = await aiGenerateStructured(CHAINS.flashLite, {
    system: AGENT_PROMPTS.sectionClassifier,
    prompt: cleanMd,
    schema: SectionClassificationSchema,
  });

  const seen = new Set<SectionType>();
  const dedupedSections = raw.sections
    .map((s) => {
      const rawStart = s.startChar ?? 0;
      const rawEnd = s.endChar ?? cleanMd.length;
      // Clamp to valid bounds — LLM sometimes returns positions beyond text length
      const clampedStart = Math.max(0, Math.min(rawStart, cleanMd.length));
      const clampedEnd = Math.max(clampedStart, Math.min(rawEnd, cleanMd.length));
      return {
        type: normalizeSectionType(s.type) as SectionType,
        markdownSlice: cleanMd.slice(clampedStart, clampedEnd),
      };
    })
    .filter((s) => VALID_SECTION_TYPES.has(s.type))
    // Deduplicate by type — keep first occurrence (earliest in page)
    .filter((s) => {
      if (seen.has(s.type)) return false;
      seen.add(s.type);
      return true;
    });

  // Assign scrollFraction from LLM response order, not startChar.
  // LLMs process markdown top-to-bottom and return sections in page order,
  // but their character-position estimates (startChar) are unreliable and
  // produce scrambled ordering (e.g. hero at 0.4, socialProof at 0.02).
  const sections: ClassifiedSection[] = dedupedSections.map((s, i) => ({
    ...s,
    scrollFraction: dedupedSections.length > 1 ? i / (dedupedSections.length - 1) : 0,
  }));

  return { url, sections };
}

export async function runClassifier(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<PageSections[]> {
  if (!ctx.pages?.length) {
    throw new AgentError("agent4", "pages is missing from pipeline context");
  }


  // Emit each domain as its classification completes — progressive reveal.
  const emitted: string[] = [];
  const results = await Promise.allSettled(
    ctx.pages.map((page) => {
      const hostname = getHostname(page.url);
      if (!page.markdown) {
        emitted.push(hostname);
        onActions?.([...emitted]);
        return Promise.resolve<PageSections>({ url: page.url, sections: [] });
      }
      return classifyPage(page.url, page.markdown).then((result) => {
        emitted.push(hostname);
        onActions?.([...emitted]);
        return result;
      });
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
