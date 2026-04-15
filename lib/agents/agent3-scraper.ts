import FirecrawlApp from "@mendable/firecrawl-js";
import type { PipelineContext, PageData, Competitor } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";
import { isUsableMarkdown } from "@/lib/utils/scrape-quality";
import { getHostname } from "@/lib/utils/url";
import { env } from "@/lib/env";
import { isUnsafeUrl } from "@/lib/utils/ssrf";

// ── Resolve a signed GCS URL to a stable base64 data URI ─────────────────
// Firecrawl returns a signed GCS URL (~30–60 min TTL). We resolve it
// immediately so Agent5 never faces an expired URL later in the pipeline.
async function resolveScreenshot(url: string): Promise<string | undefined> {
  try {
    if (isUnsafeUrl(url)) return undefined;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const buffer = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return undefined;
  }
}

// 90s for first pass, 120s for retry — input URL gets full timeouts (JS SPA retry matters).
const SCRAPE_TIMEOUT_MS = 90_000;
const SCRAPE_RETRY_TIMEOUT_MS = 120_000;
// Competitors use tighter timeouts — if they don't load in 60s, extra wait rarely helps.
// Enterprise SaaS sites that block Firecrawl won't yield better content with more time.
const COMPETITOR_SCRAPE_TIMEOUT_MS = 60_000;
const COMPETITOR_RETRY_TIMEOUT_MS = 90_000;
// Same TTL as AnalysisForm.tsx localStorage cache — Firecrawl won't serve input page data older than 2 hours.
const FIRECRAWL_MAX_AGE_MS = 2 * 60 * 60 * 1000;
// Competitors don't redesign daily — 48h cache is safe and dramatically increases cache hit rate.
// Input URL intentionally stays at 2h (user wants fresh data about their own page).
const COMPETITOR_MAX_AGE_MS = 48 * 60 * 60 * 1000;

async function scrapePage(
  firecrawl: FirecrawlApp,
  url: string,
  waitFor?: number,
  timeoutMs?: number,
  maxAge: number = FIRECRAWL_MAX_AGE_MS
): Promise<PageData> {
  const defaultTimeout = waitFor ? SCRAPE_RETRY_TIMEOUT_MS : SCRAPE_TIMEOUT_MS;
  const scraped = await firecrawl.scrape(url, {
    formats: ["markdown", "screenshot"],
    timeout: timeoutMs ?? defaultTimeout,
    maxAge,
    ...(waitFor ? { waitFor } : {}),
  });

  const rawScreenshot = scraped.screenshot;
  let screenshotBase64: string | undefined;

  if (rawScreenshot) {
    if (rawScreenshot.startsWith("http")) {
      // Signed GCS URL — resolve to base64 now while it's fresh
      screenshotBase64 = await resolveScreenshot(rawScreenshot);
      // If fetch failed, fall back to the URL — Agent5 will attempt a retry
      if (!screenshotBase64) screenshotBase64 = rawScreenshot;
    } else {
      screenshotBase64 = rawScreenshot;
    }
  }

  return {
    url,
    markdown: scraped.markdown ?? "",
    screenshotBase64,
  };
}

// ── Two-pass scrape for JS-heavy SPAs (used for input URL only) ───────────
// Pass 1: fast, no wait. Pass 2: only if markdown is thin/empty — add 8 s
// waitFor so the browser has time for client-side JS hydration.
// maxTimeout caps both passes when the pipeline deadline is approaching.
async function scrapePageWithRetry(
  firecrawl: FirecrawlApp,
  url: string,
  maxTimeout?: number
): Promise<PageData> {
  const t1 = maxTimeout ? Math.min(SCRAPE_TIMEOUT_MS, Math.max(15_000, maxTimeout)) : SCRAPE_TIMEOUT_MS;
  const t2 = maxTimeout ? Math.min(SCRAPE_RETRY_TIMEOUT_MS, Math.max(15_000, maxTimeout)) : SCRAPE_RETRY_TIMEOUT_MS;

  const first = await scrapePage(firecrawl, url, undefined, t1);
  if (isUsableMarkdown(first.markdown)) return first;

  console.warn(
    `[agent3] ${url}: thin content (${first.markdown.length} chars) — retrying with waitFor: 8000ms`
  );
  const second = await scrapePage(firecrawl, url, 8000, t2);
  // Return whichever had more content; warn if both are thin
  const best = second.markdown.length >= first.markdown.length ? second : first;
  if (!isUsableMarkdown(best.markdown)) {
    console.warn(`[agent3] ${url}: still thin after retry (${best.markdown.length} chars)`);
  }
  return best;
}

// ── Competitor scrape with tighter timeouts ───────────────────────────────────
// Uses COMPETITOR_SCRAPE_TIMEOUT_MS / COMPETITOR_RETRY_TIMEOUT_MS instead of the
// full 90s/120s used for the input URL. A budget-aware `maxTimeout` further caps
// these when the pipeline deadline is approaching.
async function scrapeCompetitorPage(
  firecrawl: FirecrawlApp,
  url: string,
  maxTimeout: number = COMPETITOR_SCRAPE_TIMEOUT_MS
): Promise<PageData> {
  const firstTimeout = Math.min(COMPETITOR_SCRAPE_TIMEOUT_MS, Math.max(15_000, maxTimeout));
  const retryTimeout = Math.min(COMPETITOR_RETRY_TIMEOUT_MS, Math.max(15_000, maxTimeout));

  const first = await scrapePage(firecrawl, url, undefined, firstTimeout, COMPETITOR_MAX_AGE_MS);
  if (isUsableMarkdown(first.markdown)) return first;

  console.warn(
    `[agent3] ${url}: thin content (${first.markdown.length} chars) — retrying with waitFor: 8000ms`
  );
  const second = await scrapePage(firecrawl, url, 8000, retryTimeout, COMPETITOR_MAX_AGE_MS);
  const best = second.markdown.length >= first.markdown.length ? second : first;
  if (!isUsableMarkdown(best.markdown)) {
    console.warn(`[agent3] ${url}: still thin after retry (${best.markdown.length} chars)`);
  }
  return best;
}

export async function runScraper(
  ctx: PipelineContext,
  scrapeDeadline?: number,
  onActions?: (actions: string[]) => void
): Promise<PageData[]> {
  const { inputUrl, competitors } = ctx;

  if (!competitors?.length) {
    throw new AgentError("agent3", "competitors is missing from pipeline context");
  }

  const firecrawl = new FirecrawlApp({
    apiKey: env().FIRECRAWL_API_KEY,
  });

  // Top 3 = primary; positions 4–5 (if present from agent2) = fallback pool
  const primaryCompetitors = competitors.slice(0, 3);
  const backupCompetitors = competitors.slice(3);


  // Emit input hostname immediately; competitor hostnames appear as each scrape completes.
  const emitted: string[] = [getHostname(inputUrl)];
  onActions?.([...emitted]);

  // ── Reuse Agent 0 scrape or scrape input page fresh ─────────────
  // Agent 0 already scraped the input URL (markdown + screenshot).
  // Reusing it saves one Firecrawl API call (~5-10s).
  let inputPage: PageData;
  if (ctx.inputPageData?.markdown && isUsableMarkdown(ctx.inputPageData.markdown)) {
    inputPage = { ...ctx.inputPageData };
    // Resolve screenshot URL to base64 if needed (Agent 0 passes raw Firecrawl response)
    if (inputPage.screenshotBase64?.startsWith("http")) {
      const resolved = await resolveScreenshot(inputPage.screenshotBase64);
      inputPage.screenshotBase64 = resolved ?? inputPage.screenshotBase64;
    }
    console.log(`[agent3] Reusing Agent 0 scrape for ${inputUrl} (${inputPage.markdown.length} chars)`);
  } else {
    try {
      // Cap input URL scrape to remaining budget (minus 60s reserve for competitors + downstream).
      const inputMaxTimeout = scrapeDeadline
        ? Math.max(15_000, scrapeDeadline - Date.now() - 60_000)
        : undefined;
      inputPage = await scrapePageWithRetry(firecrawl, inputUrl, inputMaxTimeout);
    } catch (err) {
      throw new AgentError(
        "agent3",
        `Failed to scrape input URL ${inputUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const pages: PageData[] = [inputPage];
  const finalCompetitors: Competitor[] = [];
  const fallbackQueue = [...backupCompetitors];

  // Per-competitor timeout respects the deadline — auto-compresses when budget is short.
  const competitorTimeout = scrapeDeadline
    ? Math.min(COMPETITOR_SCRAPE_TIMEOUT_MS, Math.max(15_000, scrapeDeadline - Date.now() - 60_000))
    : COMPETITOR_SCRAPE_TIMEOUT_MS;

  // ── Scrape all primary competitors in parallel ────────────────────────────
  const primaryResults = await Promise.allSettled(
    primaryCompetitors.map((c) =>
      scrapeCompetitorPage(firecrawl, c.url, competitorTimeout).then((page) => {
        emitted.push(getHostname(c.url));
        onActions?.([...emitted]);
        return page;
      })
    )
  );

  // ── Collect succeeded / failed primaries ─────────────────────────────────
  const failedPrimaries: Competitor[] = [];
  for (const [i, result] of primaryResults.entries()) {
    const competitor = primaryCompetitors[i];
    if (result.status === "fulfilled" && result.value.markdown) {
      pages.push(result.value);
      finalCompetitors.push(competitor);
    } else {
      if (result.status === "rejected") {
        console.warn(
          `[agent3] Primary competitor failed (${competitor.url}):`,
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        );
      }
      failedPrimaries.push(competitor);
    }
  }

  // ── Launch backup competitors in PARALLEL (not sequentially) ─────────────
  // Run one backup per failed primary simultaneously; take all that succeed.
  // Before: 2 sequential backups × 90s = 180s worst case.
  // After:  2 parallel backups   = max(90s) = 90s worst case.
  if (failedPrimaries.length > 0 && fallbackQueue.length > 0) {
    const backupsNeeded = Math.min(failedPrimaries.length, fallbackQueue.length);
    const backupsToTry = fallbackQueue.splice(0, backupsNeeded);

    const backupTimeout = scrapeDeadline
      ? Math.min(COMPETITOR_SCRAPE_TIMEOUT_MS, Math.max(15_000, scrapeDeadline - Date.now() - 30_000))
      : COMPETITOR_SCRAPE_TIMEOUT_MS;

    const backupResults = await Promise.allSettled(
      backupsToTry.map((c) =>
        scrapeCompetitorPage(firecrawl, c.url, backupTimeout).then((page) => {
          emitted.push(getHostname(c.url));
          onActions?.([...emitted]);
          return { page, competitor: c };
        })
      )
    );

    for (const [i, br] of backupResults.entries()) {
      const primaryFailed = failedPrimaries[i];
      if (br.status === "fulfilled" && br.value.page.markdown) {
        pages.push(br.value.page);
        finalCompetitors.push(br.value.competitor);
        console.log(`[agent3] Substituted ${primaryFailed.url} → ${br.value.competitor.url}`);
      } else {
        if (br.status === "rejected") {
          console.warn(
            `[agent3] Backup also failed (${backupsToTry[i].url}):`,
            br.reason instanceof Error ? br.reason.message : String(br.reason)
          );
        }
        console.warn(`[agent3] No successful scrape for ${primaryFailed.url}, skipping`);
      }
    }
  }

  if (finalCompetitors.length === 0) {
    throw new AgentError("agent3", "Failed to scrape any competitor pages — cannot proceed with analysis.");
  }
  if (finalCompetitors.length < primaryCompetitors.length) {
    console.warn(
      `[agent3] Only ${finalCompetitors.length}/${primaryCompetitors.length} competitors scraped — proceeding with reduced comparison.`
    );
  }

  // Update ctx.competitors to reflect who was actually scraped
  ctx.competitors = finalCompetitors;

  return pages;
}
