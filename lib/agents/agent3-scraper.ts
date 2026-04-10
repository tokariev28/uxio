import FirecrawlApp from "@mendable/firecrawl-js";
import type { PipelineContext, PageData, Competitor } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

// ── Resolve a signed GCS URL to a stable base64 data URI ─────────────────
// Firecrawl returns a signed GCS URL (~30–60 min TTL). We resolve it
// immediately so Agent5 never faces an expired URL later in the pipeline.
async function resolveScreenshot(url: string): Promise<string | undefined> {
  try {
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
  url: string
): Promise<PageData> {
  const scraped = await firecrawl.scrape(url, {
    formats: ["markdown", "screenshot"],
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

export async function runScraper(
  ctx: PipelineContext,
  onActions?: (actions: string[]) => void
): Promise<PageData[]> {
  const { inputUrl, competitors } = ctx;

  if (!competitors?.length) {
    throw new AgentError("agent3", "competitors is missing from pipeline context");
  }

  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });

  // Top 3 = primary; positions 4–5 (if present from agent2) = fallback pool
  const primaryCompetitors = competitors.slice(0, 3);
  const backupCompetitors = competitors.slice(3);

  // Emit all URLs being scraped as chips (primary only for display)
  const hostnames = [inputUrl, ...primaryCompetitors.map((c) => c.url)].map((u) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
  });
  onActions?.(hostnames);

  // ── Always scrape input page ──────────────────────────────────────
  let inputPage: PageData;
  try {
    inputPage = await scrapePage(firecrawl, inputUrl);
  } catch (err) {
    throw new AgentError(
      "agent3",
      `Failed to scrape input URL ${inputUrl}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const pages: PageData[] = [inputPage];
  const finalCompetitors: Competitor[] = [];
  const fallbackQueue = [...backupCompetitors];

  // ── Scrape each primary competitor; substitute backup on failure ──
  for (const competitor of primaryCompetitors) {
    let page: PageData | null = null;
    let successCompetitor: Competitor = competitor;

    try {
      page = await scrapePage(firecrawl, competitor.url);
    } catch (primaryErr) {
      console.warn(
        `[agent3] Primary competitor failed (${competitor.url}):`,
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      );

      // Try backups in order
      while (fallbackQueue.length > 0) {
        const backup = fallbackQueue.shift()!;
        try {
          page = await scrapePage(firecrawl, backup.url);
          successCompetitor = backup;
          console.log(`[agent3] Substituted ${competitor.url} → ${backup.url}`);
          break;
        } catch (backupErr) {
          console.warn(
            `[agent3] Backup also failed (${backup.url}):`,
            backupErr instanceof Error ? backupErr.message : String(backupErr)
          );
        }
      }
    }

    if (page && page.markdown) {
      pages.push(page);
      finalCompetitors.push(successCompetitor);
    } else {
      console.warn(`[agent3] No successful scrape for ${competitor.url}, skipping`);
    }
  }

  // Update ctx.competitors to reflect who was actually scraped
  ctx.competitors = finalCompetitors;

  return pages;
}
