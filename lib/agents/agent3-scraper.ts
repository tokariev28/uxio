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

async function scrapePage(
  firecrawl: FirecrawlApp,
  url: string,
  waitFor?: number
): Promise<PageData> {
  const scraped = await firecrawl.scrape(url, {
    formats: ["markdown", "screenshot"],
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
async function scrapePageWithRetry(
  firecrawl: FirecrawlApp,
  url: string
): Promise<PageData> {
  const first = await scrapePage(firecrawl, url);
  if (isUsableMarkdown(first.markdown)) return first;

  console.warn(
    `[agent3] ${url}: thin content (${first.markdown.length} chars) — retrying with waitFor: 8000ms`
  );
  const second = await scrapePage(firecrawl, url, 8000);
  // Return whichever had more content; warn if both are thin
  const best = second.markdown.length >= first.markdown.length ? second : first;
  if (!isUsableMarkdown(best.markdown)) {
    console.warn(`[agent3] ${url}: still thin after retry (${best.markdown.length} chars)`);
  }
  return best;
}

export async function runScraper(
  ctx: PipelineContext,
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
      inputPage = await scrapePageWithRetry(firecrawl, inputUrl);
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

  // ── Scrape all primary competitors in parallel; substitute backup on failure ──
  const primaryResults = await Promise.allSettled(
    primaryCompetitors.map((c) =>
      scrapePageWithRetry(firecrawl, c.url).then((page) => {
        emitted.push(getHostname(c.url));
        onActions?.([...emitted]);
        return page;
      })
    )
  );

  for (const [i, result] of primaryResults.entries()) {
    const competitor = primaryCompetitors[i];

    if (result.status === "fulfilled" && result.value.markdown) {
      pages.push(result.value);
      finalCompetitors.push(competitor);
      continue;
    }

    // Primary failed — try backups sequentially
    if (result.status === "rejected") {
      console.warn(
        `[agent3] Primary competitor failed (${competitor.url}):`,
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      );
    }

    let substituted = false;
    while (fallbackQueue.length > 0) {
      const backup = fallbackQueue.shift()!;
      try {
        const page = await scrapePageWithRetry(firecrawl, backup.url);
        if (page.markdown) {
          pages.push(page);
          finalCompetitors.push(backup);
          emitted.push(getHostname(backup.url));
          onActions?.([...emitted]);
          console.log(`[agent3] Substituted ${competitor.url} → ${backup.url}`);
          substituted = true;
          break;
        }
      } catch (backupErr) {
        console.warn(
          `[agent3] Backup also failed (${backup.url}):`,
          backupErr instanceof Error ? backupErr.message : String(backupErr)
        );
      }
    }

    if (!substituted) {
      console.warn(`[agent3] No successful scrape for ${competitor.url}, skipping`);
    }
  }

  // Update ctx.competitors to reflect who was actually scraped
  ctx.competitors = finalCompetitors;

  return pages;
}
