import FirecrawlApp from "@mendable/firecrawl-js";
import type { PipelineContext, PageData } from "@/lib/types/analysis";
import { AgentError } from "@/lib/agents/errors";

async function scrapePage(
  firecrawl: FirecrawlApp,
  url: string
): Promise<PageData> {
  const scraped = await firecrawl.scrape(url, {
    formats: ["markdown", "screenshot"],
  });

  return {
    url,
    markdown: scraped.markdown ?? "",
    // Firecrawl returns a signed GCS URL here, not actual base64 —
    // agent5 resolves this to base64 before passing to Gemini
    screenshotBase64: scraped.screenshot ?? undefined,
  };
}

export async function runScraper(
  ctx: PipelineContext
): Promise<PageData[]> {
  const { inputUrl, competitors } = ctx;

  if (!competitors?.length) {
    throw new AgentError("agent3", "competitors is missing from pipeline context");
  }

  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });

  const urls = [inputUrl, ...competitors.map((c) => c.url)];

  return Promise.all(
    urls.map(async (url) => {
      try {
        return await scrapePage(firecrawl, url);
      } catch (err) {
        console.error(
          `[agent3] Failed to scrape ${url}:`,
          err instanceof Error ? err.message : String(err)
        );
        return { url, markdown: "", screenshotBase64: "" };
      }
    })
  );
}
