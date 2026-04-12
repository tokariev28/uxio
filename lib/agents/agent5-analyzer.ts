import { z } from "zod";
import { AGENT_PROMPTS } from "@/lib/agents/prompts";
import { aiGenerateMultimodal, CHAINS } from "@/lib/ai/gateway";
import { stripMarkdownLinks, stripBoilerplate, stripInlineCode } from "@/lib/utils/markdown-clean";
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
import { getHostname, getHostnameOrEmpty } from "@/lib/utils/url";
import { isUnsafeUrl } from "@/lib/utils/ssrf";

// ── Zod schema for runtime validation of multimodal LLM response ─────────
// aiGenerateMultimodal returns raw text, so we validate with Zod after parsing.
const BatchSectionResultSchema = z.object({
  sectionType: z.string(),
  scores: z.object({
    clarity: z.coerce.number(),
    specificity: z.coerce.number(),
    icpFit: z.coerce.number(),
    attentionRatio: z.coerce.number(),
    ctaQuality: z.coerce.number(),
    trustSignals: z.coerce.number(),
    visualHierarchy: z.coerce.number(),
    cognitiveEase: z.coerce.number(),
    typographyReadability: z.coerce.number(),
    densityBalance: z.coerce.number(),
  }).nullable().optional(),
  overallScore: z.coerce.number(),
  confidence: z.coerce.number().nullable().optional(),
  strengths: z.array(z.string()).nullable().transform(v => v ?? []),
  weaknesses: z.array(z.string()).nullable().transform(v => v ?? []),
  keyEvidence: z.object({
    headlineText: z.string().nullable(),
    ctaText: z.string().nullable(),
    copyQuote: z.string().nullable(),
    visualObservation: z.string().nullable().transform(v => v ?? ""),
  }),
});

type BatchSectionResult = z.infer<typeof BatchSectionResultSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────

function siteLabel(
  url: string,
  inputUrl: string,
  competitors: Array<{ url: string; name: string }>
): string {
  if (url === inputUrl) return "input";
  // Domain-based match for input URL — handles trailing slash, redirects,
  // or any minor URL difference introduced by Firecrawl
  const urlHost = getHostnameOrEmpty(url);
  const inputHost = getHostnameOrEmpty(inputUrl);
  if (urlHost && urlHost === inputHost) return "input";
  // Exact competitor match
  const exact = competitors.find((c) => c.url === url);
  if (exact) return exact.name;
  // Domain-based competitor fallback
  if (urlHost) {
    const byDomain = competitors.find((c) => getHostnameOrEmpty(c.url) === urlHost);
    if (byDomain) return byDomain.name;
  }
  return url;
}

async function urlToBase64(url: string): Promise<string> {
  const ssrfError = isUnsafeUrl(url);
  if (ssrfError) throw new Error(`SSRF blocked: ${ssrfError}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Screenshot fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ── Evidence grounding ────────────────────────────────────────────────────
// The prompt now requires every insight to start with a quote or visual
// description. We no longer auto-inject quotes into generic text — that
// masked weak LLM output instead of fixing it. The quality-scorer will
// honestly report ungrounded insights, and the prompt improvements prevent
// them from occurring in the first place.

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
      markdownSlice: stripBoilerplate(stripMarkdownLinks(s.markdownSlice)).slice(0, MAX_MARKDOWN_CHARS),
    }));

  const sectionsInput = limitedSections
    .map(
      (s, i) =>
        `SECTION ${i + 1}:\nTYPE: ${s.type}\nSCROLL_POSITION: ${(s.scrollFraction * 100).toFixed(0)}% from top\nMARKDOWN:\n${s.markdownSlice}`
    )
    .join("\n\n---\n\n");

  // Pass rich product context so the LLM can score icpFit, ctaQuality, and
  // specificity against real product data instead of guessing.
  const brief = ctx.productBrief!;
  const productContext = [
    `TARGET ICP: ${brief.icp}`,
    `CORE VALUE PROP: ${brief.coreValueProp}`,
    brief.keyFeatures?.length ? `KEY FEATURES: ${brief.keyFeatures.join("; ")}` : null,
    brief.pricingModel ? `PRICING MODEL: ${brief.pricingModel}` : null,
    brief.hasFreeTrialOrFreemium != null ? `FREE TRIAL/FREEMIUM: ${brief.hasFreeTrialOrFreemium ? "yes" : "no"}` : null,
    brief.industry ? `INDUSTRY: ${brief.industry}` : null,
  ].filter(Boolean).join("\n");

  const textContent = `${productContext}\n\nYou will analyze exactly ${limitedSections.length} sections. Your JSON array must contain exactly ${limitedSections.length} objects.\n\nSECTIONS TO ANALYZE:\n\n${sectionsInput}`;

  // ── Single Flash call (multimodal: screenshot + all sections) ──────
  const rawText = await aiGenerateMultimodal(CHAINS.flash, {
    system: AGENT_PROMPTS.sectionAnalyzerBatch,
    textContent,
    imageBase64: screenshotData ?? undefined,
    json: true,
  });

  let parsed: BatchSectionResult[];
  try {
    const jsonArr = JSON.parse(extractJSON(rawText));
    parsed = z.array(BatchSectionResultSchema).parse(jsonArr);
  } catch {
    // Tier 2: jsonrepair fixes common LLM JSON flaws (literal newlines in strings,
    // trailing commas, unescaped quotes) without burning a full LLM retry.
    try {
      const repaired = JSON.parse(jsonrepair(extractJSON(rawText)));
      parsed = z.array(BatchSectionResultSchema).parse(repaired);
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
        const retryRepaired = JSON.parse(jsonrepair(extractJSON(retryText)));
        parsed = z.array(BatchSectionResultSchema).parse(retryRepaired);
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
      if (item.confidence != null && item.confidence > 0.7) item.confidence = 0.7;
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

  // Emit input hostname immediately; competitors appear at their 600 ms stagger point.
  const emitted: string[] = [getHostname(inputPage.url)];
  onActions?.([...emitted]);

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
          setTimeout(() => {
            emitted.push(getHostname(page.url));
            onActions?.([...emitted]);
            makeJob(page).then(resolve, reject);
          }, i * 600);
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

      const strengths = (raw.strengths ?? [])
        .filter((s): s is string => typeof s === "string")
        .map(stripInlineCode);
      const weaknesses = (raw.weaknesses ?? [])
        .filter((s): s is string => typeof s === "string")
        .map(stripInlineCode);

      // Compute score deterministically from sub-scores (LLMs get weighted arithmetic wrong)
      const computedScore = computeWeightedScore(raw.scores);
      let score = computedScore >= 0 ? computedScore : Math.max(0, Math.min(1, raw.overallScore));

      // Light safeguard: only cap truly egregious inconsistencies.
      // The weighted sub-scores already encode quality — aggressive caps
      // destroy differentiation (the "all 55" bug).
      if (weaknesses.length >= 3 && strengths.length === 0 && score > 0.5) {
        score = 0.5;
      }
      if (score >= 0.92 && weaknesses.length >= 3) {
        score = 0.88;
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
        strengths: strengths,
        weaknesses: weaknesses,
        summary: strengths[0] ?? weaknesses[0] ?? "No notable findings",
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

  // Attach input-page scroll position and sort so results match actual page order
  const inputPageSections = ctx.pageSections?.find(
    (ps) => ps.url === ctx.inputUrl
  );
  const scrollLookup = new Map<SectionType, number>(
    inputPageSections?.sections.map((s) => [s.type, s.scrollFraction]) ?? []
  );

  const analyses = Array.from(analysisMap.values())
    .map((sa) => ({
      ...sa,
      scrollFraction: scrollLookup.get(sa.sectionType) ?? 1.0,
    }))
    .sort((a, b) => (a.scrollFraction ?? 1) - (b.scrollFraction ?? 1));

  return { analyses, failedUrls };
}
