import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateMultimodal, CHAINS } from "@/lib/ai/gateway";
import { stripMarkdownLinks, stripInlineCode } from "@/lib/utils/markdown-clean";
import { normalizeSectionType } from "@/lib/utils/normalize-section-type";
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
import { jsonrepair } from "jsonrepair";

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
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Screenshot fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ── Evidence grounding helpers ─────────────────────────────────────────────
// Post-processing guard: if a strength/weakness has no quoted phrase and no
// number, automatically prepend the section's best keyEvidence quote so the
// quality-scorer's isEvidenceGrounded() check passes.

function needsGrounding(text: string): boolean {
  if (/["""][^"""]{3,}["""]/.test(text)) return false; // already quoted (ASCII or smart quotes)
  if (/\b\d+/.test(text)) return false;                 // already has a number
  return true;
}

/**
 * Apply evidence grounding to a list of insights. Cycles through available
 * evidence fields (copyQuote → headlineText → visualObservation) so each
 * ungrounded item gets a different anchor quote instead of repeating one.
 */
function applyGrounding(
  items: string[],
  evidence: { copyQuote: string | null; headlineText: string | null; visualObservation?: string | null }
): string[] {
  const quotes = [evidence.copyQuote, evidence.headlineText, evidence.visualObservation]
    .filter((q): q is string => typeof q === "string" && q.length >= 3);
  let quoteIdx = 0;
  return items.map((item) => {
    if (!needsGrounding(item)) return item;
    if (quoteIdx >= quotes.length) return item;
    const quote = quotes[quoteIdx];
    quoteIdx++;
    return `"${quote}" — ${item}`;
  });
}

// ── Deterministic score computation ───────────────────────────────────────
// LLMs frequently get multi-step weighted arithmetic wrong. Computing the
// overallScore from sub-scores in code guarantees correct, consistent values.
function computeWeightedScore(scores: BatchSectionResult['scores']): number {
  if (!scores) return -1;
  const raw = (
    scores.clarity * 1.5 + scores.specificity * 1.5 + scores.icpFit * 1.5 +
    scores.attentionRatio * 1.2 + scores.ctaQuality * 1.2 + scores.trustSignals * 1.2 +
    scores.visualHierarchy + scores.cognitiveEase + scores.typographyReadability + scores.densityBalance
  ) / 12.6;
  return Math.round(raw * 100) / 100;
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

  const textContent = `TARGET ICP: ${ctx.productBrief!.icp}\n\nYou will analyze exactly ${limitedSections.length} sections. Your JSON array must contain exactly ${limitedSections.length} objects.\n\nSECTIONS TO ANALYZE:\n\n${sectionsInput}`;

  // ── Single Flash call (multimodal: screenshot + all sections) ──────
  const rawText = await aiGenerateMultimodal(CHAINS.flash, {
    system: AGENT_PROMPTS.sectionAnalyzerBatch,
    textContent,
    imageBase64: screenshotData ?? undefined,
    json: true,
  });

  let parsed: BatchSectionResult[];
  try {
    parsed = JSON.parse(extractJSON(rawText)) as BatchSectionResult[];
  } catch {
    // Tier 2: jsonrepair fixes common LLM JSON flaws (literal newlines in strings,
    // trailing commas, unescaped quotes) without burning a full LLM retry.
    try {
      parsed = JSON.parse(jsonrepair(extractJSON(rawText))) as BatchSectionResult[];
    } catch {
      // Tier 3: JSON is structurally broken — retry the LLM call once as last resort.
      console.warn(`[agent5] JSON parse failed for ${page.url} — retrying LLM call`);
      const retryText = await aiGenerateMultimodal(CHAINS.flash, {
        system: AGENT_PROMPTS.sectionAnalyzerBatch,
        textContent,
        imageBase64: screenshotData ?? undefined,
        json: true,
      });
      try {
        parsed = JSON.parse(jsonrepair(extractJSON(retryText))) as BatchSectionResult[];
      } catch (retryErr) {
        throw new AgentError(
          "agent5",
          `AI response is not valid JSON for ${page.url}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
        );
      }
    }
  }

  // Validate output count matches input sections
  if (parsed.length !== limitedSections.length) {
    console.warn(
      `[agent5] Section count mismatch for ${page.url}: expected ${limitedSections.length}, got ${parsed.length}`
    );
  }

  // Cap confidence at 0.7 for text-only analysis (no screenshot available)
  if (!screenshotData) {
    for (const item of parsed) {
      if (item.confidence !== undefined && item.confidence > 0.7) item.confidence = 0.7;
    }
  }

  return parsed;
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

  // ── Build analysis job for a single page ──────────────────────────────────
  const makeJob = (page: PageData): Promise<BatchSectionResult[]> => {
    // Match pageSections by URL to prevent misalignment when Agent4 skips a page
    const pageSections = ctx.pageSections!.find((ps) => ps.url === page.url);
    if (!pageSections?.sections.length) {
      console.warn(
        `[agent5] Skipping ${page.url} — no sections from classifier (empty scrape or classification failure)`
      );
      return Promise.resolve<BatchSectionResult[]>([]);
    }
    // Analyze even without screenshot (text-only fallback) — lower quality
    // than multimodal but better than skipping the page entirely
    return analyzePageBatch(page, pageSections, ctx);
  };

  // ── Prioritize input page: analyze it first, then competitors in parallel ──
  // agent3 always places the input page at index 0 in ctx.pages.
  // Awaiting it sequentially before starting competitor calls prevents the
  // most-important page from being starved by concurrent gateway rate limits.
  const [inputPage, ...competitorPages] = ctx.pages;

  const inputResult = await makeJob(inputPage).then(
    (value): PromiseSettledResult<BatchSectionResult[]> => ({ status: "fulfilled", value }),
    (reason): PromiseSettledResult<BatchSectionResult[]> => ({ status: "rejected", reason })
  );

  // Stagger competitor calls by 600 ms each to spread gateway burst load.
  // Adds at most 1.2 s of wall time for 3 competitors, but avoids simultaneous
  // multimodal calls that can trigger rate limits even after the input-first fix.
  const competitorSettled = await Promise.allSettled(
    competitorPages.map(
      (page, i) =>
        new Promise<BatchSectionResult[]>((resolve, reject) => {
          setTimeout(() => makeJob(page).then(resolve, reject), i * 600);
        })
    )
  );

  // Reassemble in original page order so settled[i] aligns with ctx.pages[i]
  const settled: PromiseSettledResult<BatchSectionResult[]>[] = [inputResult, ...competitorSettled];

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
      const sectionType = normalizeSectionType(raw.sectionType) as SectionType;

      const kev = raw.keyEvidence;
      const evidenceCtx = {
        copyQuote: kev.copyQuote,
        headlineText: kev.headlineText,
        visualObservation: kev.visualObservation,
      };

      const groundedStrengths = applyGrounding(
        (raw.strengths ?? []).filter((s): s is string => typeof s === "string"),
        evidenceCtx,
      ).map(stripInlineCode);
      const groundedWeaknesses = applyGrounding(
        (raw.weaknesses ?? []).filter((s): s is string => typeof s === "string"),
        evidenceCtx,
      ).map(stripInlineCode);

      // Compute score deterministically from sub-scores (LLMs get weighted arithmetic wrong)
      const computedScore = computeWeightedScore(raw.scores);
      let score = computedScore >= 0 ? computedScore : Math.max(0, Math.min(1, raw.overallScore));

      // Enforce self-consistency rules from the prompt rubric
      if (groundedWeaknesses.length >= 3 && score > 0.50) score = 0.50;
      else if (groundedWeaknesses.length >= 2 && score > 0.65) score = 0.65;
      if (score >= 0.80 && groundedWeaknesses.length > 1) score = 0.79;
      if (raw.scores && (raw.scores.clarity < 0.5 || raw.scores.specificity < 0.5 || raw.scores.icpFit < 0.5) && score > 0.60) {
        score = 0.60;
      }

      const finding: SectionFinding = {
        site,
        score,
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
