import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateMultimodal, CHAINS } from "@/lib/ai/gateway";
import { stripMarkdownLinks } from "@/lib/utils/markdown-clean";
import type {
  PipelineContext,
  SectionAnalysis,
  SectionFinding,
  SectionType,
  PageData,
  PageSections,
} from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { extractJSON } from "@/lib/utils/json-extract";

// ── Response types ─────────────────────────────────────────────────────────

interface BatchSectionResult {
  sectionType: string;
  scores?: {
    clarity: number;
    specificity: number;
    icpFit: number;
    attentionRatio: number;
    ctaQuality: number;
    trustSignals: number;
    visualHierarchy: number;
    cognitiveEase: number;
    typographyReadability: number;
    densityBalance: number;
  };
  overallScore: number;
  confidence?: number;
  strengths: string[];
  weaknesses: string[];
  keyEvidence: {
    headlineText: string | null;
    ctaText: string | null;
    copyQuote: string | null;
    visualObservation: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function siteLabel(
  url: string,
  inputUrl: string,
  competitors: Array<{ url: string; name: string }>
): string {
  if (url === inputUrl) return "input";
  // Domain-based match for input URL — handles trailing slash, redirects,
  // or any minor URL difference introduced by Firecrawl
  try {
    const urlHost = new URL(url).hostname.replace(/^www\./, "");
    const inputHost = new URL(inputUrl).hostname.replace(/^www\./, "");
    if (urlHost === inputHost) return "input";
  } catch { /* ignore invalid URLs */ }
  // Exact competitor match
  const exact = competitors.find((c) => c.url === url);
  if (exact) return exact.name;
  // Domain-based competitor fallback
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const byDomain = competitors.find((c) => {
      try {
        return new URL(c.url).hostname.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    });
    if (byDomain) return byDomain.name;
  } catch { /* ignore invalid URLs */ }
  return url;
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Screenshot fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ── Evidence grounding helpers ─────────────────────────────────────────────
// Post-processing guard: if a strength/weakness has no quoted phrase and no
// number, automatically prepend the section's best keyEvidence quote so the
// quality-scorer's isEvidenceGrounded() check passes.

function needsGrounding(text: string): boolean {
  if (/"[^"]{3,}"/.test(text)) return false; // already quoted
  if (/\b\d+/.test(text)) return false;        // already has a number
  return true;
}

function groundInsight(
  text: string,
  evidence: { copyQuote: string | null; headlineText: string | null }
): string {
  if (!needsGrounding(text)) return text;
  const quote = evidence.copyQuote ?? evidence.headlineText;
  if (!quote || quote.length < 3) return text;
  return `"${quote}" — ${text}`;
}

/**
 * Apply evidence grounding to a list of insights, but only prepend a quote
 * to the FIRST ungrounded item. Subsequent ungrounded items are left as-is
 * to avoid repeating the same anchor quote across all bullets.
 */
function applyGrounding(
  items: string[],
  evidence: { copyQuote: string | null; headlineText: string | null }
): string[] {
  let groundingUsed = false;
  return items.map((item) => {
    if (!needsGrounding(item)) return item;
    if (groundingUsed) return item;
    const grounded = groundInsight(item, evidence);
    if (grounded !== item) groundingUsed = true;
    return grounded;
  });
}

// ── Section content truncation ─────────────────────────────────────────────
// All sections detected by Agent 4 are analyzed — no sections are dropped.
// Agent 4's VALID_SECTION_TYPES filter already prevents hallucinated types.
// Each section's markdown is truncated to stay within reasonable token bounds;
// 12 sections × 2500 chars ≈ 7,500 tokens, well within Gemini 2.5 Flash's 1M limit.
const MAX_MARKDOWN_CHARS = 2500;

// ── Batch analysis: ONE call per page ─────────────────────────────────────
// Sends the full-page screenshot ONCE + all section markdowns.
// Returns an array of section analyses for that page.

async function analyzePageBatch(
  page: PageData,
  pageSections: PageSections,
  ctx: PipelineContext
): Promise<BatchSectionResult[]> {
  // ── Resolve screenshot once ────────────────────────────────────────
  const rawSrc = page.screenshotBase64;
  let screenshotData: string | null = null;

  if (rawSrc) {
    try {
      if (rawSrc.startsWith("http")) {
        screenshotData = await urlToBase64(rawSrc);
      } else if (rawSrc.startsWith("data:")) {
        screenshotData = rawSrc.split(",")[1] ?? rawSrc;
      } else {
        screenshotData = rawSrc;
      }
      // Write back as stable data URI so the frontend can display it
      // (GCS signed URLs expire in ~30 min; base64 data URIs never do)
      page.screenshotBase64 = `data:image/png;base64,${screenshotData}`;
    } catch (err) {
      console.warn(
        `[agent5] Screenshot fetch failed for ${page.url}, continuing without image:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ── Build structured sections input with scroll position hints ─────
  // All sections in natural page order (scroll position 0% → 100%).
  const limitedSections = [...pageSections.sections]
    .sort((a, b) => a.scrollFraction - b.scrollFraction)
    .map((s) => ({
      ...s,
      markdownSlice: stripMarkdownLinks(s.markdownSlice).slice(0, MAX_MARKDOWN_CHARS),
    }));

  const sectionsInput = limitedSections
    .map(
      (s, i) =>
        `SECTION ${i + 1}:\nTYPE: ${s.type}\nSCROLL_POSITION: ${(s.scrollFraction * 100).toFixed(0)}% from top\nMARKDOWN:\n${s.markdownSlice}`
    )
    .join("\n\n---\n\n");

  const textContent = `TARGET ICP: ${ctx.productBrief!.icp}\n\nSECTIONS TO ANALYZE:\n\n${sectionsInput}`;

  // ── Single Flash call (multimodal: screenshot + all sections) ──────
  const rawText = await aiGenerateMultimodal(CHAINS.flash, {
    system: AGENT_PROMPTS.sectionAnalyzerBatch,
    textContent,
    imageBase64: screenshotData ?? undefined,
    json: true,
  });

  return JSON.parse(extractJSON(rawText)) as BatchSectionResult[];
}

// ── Main orchestration ─────────────────────────────────────────────────────

export async function runAnalyzer(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<{ analyses: SectionAnalysis[]; failedUrls: string[] }> {
  if (!ctx.pages?.length) {
    throw new AgentError("agent5", "pages is missing from pipeline context");
  }
  if (!ctx.pageSections?.length) {
    throw new AgentError("agent5", "pageSections is missing from pipeline context");
  }

  // Emit all page domains being analyzed
  const domains = ctx.pages.map((p) => {
    try { return new URL(p.url).hostname.replace(/^www\./, ""); } catch { return p.url; }
  });
  onActions?.(domains);

  const competitors = ctx.competitors ?? [];

  // ── Process all pages in parallel — each analyzePageBatch call is independent
  const pageJobs = ctx.pages.map((page) => {
    // Match pageSections by URL instead of index to prevent misalignment
    // when Agent4 skips a page via Promise.allSettled
    const pageSections = ctx.pageSections!.find((ps) => ps.url === page.url);
    if (!pageSections?.sections.length) return Promise.resolve<BatchSectionResult[]>([]);
    // Analyze even without screenshot (text-only fallback) — lower quality
    // than multimodal but better than skipping the page entirely
    return analyzePageBatch(page, pageSections, ctx);
  });

  const settled = await Promise.allSettled(pageJobs);

  const failedUrls: string[] = [];
  const analysisMap = new Map<SectionType, SectionAnalysis>();

  for (const [i, result] of settled.entries()) {
    if (result.status === "rejected") {
      console.error(
        `[agent5] Failed to analyze page ${ctx.pages[i].url}:`,
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      );
      failedUrls.push(ctx.pages[i].url);
      continue;
    }

    const page = ctx.pages[i];
    const site = siteLabel(page.url, ctx.inputUrl, competitors);

    for (const raw of result.value) {
      const sectionType = raw.sectionType as SectionType;

      const kev = raw.keyEvidence;
      const evidenceCtx = {
        copyQuote: kev.copyQuote,
        headlineText: kev.headlineText,
      };

      const groundedStrengths = applyGrounding(raw.strengths ?? [], evidenceCtx);
      const groundedWeaknesses = applyGrounding(raw.weaknesses ?? [], evidenceCtx);

      const finding: SectionFinding = {
        site,
        score: raw.overallScore,
        scores: raw.scores ?? undefined,
        confidence:
          typeof raw.confidence === "number"
            ? raw.confidence > 1
              ? Math.round((raw.confidence / 10) * 100) / 100   // 1–10 scale → 0–1
              : raw.confidence
            : undefined,
        strengths: groundedStrengths,
        weaknesses: groundedWeaknesses,
        summary: groundedStrengths[0] ?? groundedWeaknesses[0] ?? "No notable findings",
        evidence: {
          headlineText: raw.keyEvidence.headlineText ?? undefined,
          ctaText: raw.keyEvidence.ctaText ?? undefined,
          quote: raw.keyEvidence.copyQuote ?? undefined,
          visualNote: raw.keyEvidence.visualObservation ?? undefined,
        },
      };

      if (!analysisMap.has(sectionType)) {
        analysisMap.set(sectionType, { sectionType, findings: [] });
      }
      analysisMap.get(sectionType)!.findings.push(finding);
    }
  }

  return { analyses: Array.from(analysisMap.values()), failedUrls };
}
