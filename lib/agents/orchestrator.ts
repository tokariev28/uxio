import type {
  PipelineContext,
  AnalysisResult,
  AgentStage,
  PageData,
} from "@/lib/types/analysis";
import { scoreAnalysisQuality } from "@/lib/utils/quality-scorer";
import { getHostname } from "@/lib/utils/url";
import type { SSEWriter } from "@/lib/sse";
import { runAgent0 } from "./agent0";
import { runDiscovery } from "./agent1-discovery";
import { runValidator } from "./agent2-validator";
import { runScraper } from "./agent3-scraper";
import { runClassifier } from "./agent4-classifier";
import { runAnalyzer } from "./agent5-analyzer";
import { runSynthesis } from "./agent6-synthesis";

interface AgentStep {
  stage: AgentStage;
  label: string;
  maxRetries?: number;
  run: (ctx: PipelineContext) => Promise<void>;
}

async function withStepRetry(
  fn: () => Promise<void>,
  maxRetries = 1
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      // Agent steps are long-running (10–60 s each); immediate retry is fine.
    }
  }
}

export async function runPipeline(
  inputUrl: string,
  writer: SSEWriter
): Promise<void> {
  const ctx: PipelineContext = { inputUrl };
  const pipelineStart = Date.now();
  // 290s internal budget — 10s before Vercel's 300s hard kill.
  // Safe because Agent 3 uses deadline-aware parallel scraping (parallel backups + dynamic timeouts).
  const PIPELINE_BUDGET_MS = 290_000;
  // Reserve 80s for downstream agents (classification + analysis + synthesis).
  // Computed once here so the pre-scraping gate and the scraper itself share the same value.
  const scrapeDeadline = pipelineStart + PIPELINE_BUDGET_MS - 80_000;

  const steps: AgentStep[] = [
    {
      stage: "page-intelligence",
      label: "Understanding your product",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "page-intelligence", status: "running", message: "Understanding your product…", actions });
        const { brief, pageData } = await runAgent0(ctx.inputUrl, onActions);
        ctx.productBrief = brief;
        ctx.inputPageData = pageData;
      },
    },
    {
      stage: "discovery",
      label: "Finding competitors",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "discovery", status: "running", message: "Finding competitors…", actions });
        ctx.candidates = await runDiscovery(ctx, onActions);
      },
    },
    {
      stage: "validation",
      label: "Validating and ranking competitors",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "validation", status: "running", message: "Validating and ranking competitors…", actions });
        ctx.competitors = await runValidator(ctx, onActions);
      },
    },
    {
      stage: "scraping",
      label: "Scraping pages",
      // No retries — a failed scraping step already spent 60–90s per competitor.
      // Retrying would double the time and blow the 290s pipeline budget.
      maxRetries: 0,
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "scraping", status: "running", message: "Scraping pages…", actions });

        // Heartbeat every 20s — prevents CDN/proxy from dropping idle SSE connections
        // during long Firecrawl scrapes (which run 60–90s with no events).
        const heartbeat = setInterval(() => {
          writer.send({ type: "progress", stage: "scraping", status: "running", message: "Scraping pages…" });
        }, 20_000);

        try {
          ctx.pages = await runScraper(ctx, scrapeDeadline, onActions);
        } finally {
          clearInterval(heartbeat);
        }
      },
    },
    {
      stage: "classification",
      label: "Classifying page sections",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "classification", status: "running", message: "Classifying page sections…", actions });
        ctx.pageSections = await runClassifier(ctx, onActions);

        // Surface a clear warning if the input page produced no classifiable sections.
        // This happens when Firecrawl returns thin content for JS SPAs.
        const inputSections = ctx.pageSections?.find((ps) =>
          getHostname(ps.url) === getHostname(ctx.inputUrl)
        );
        if (!inputSections?.sections.length) {
          writer.send({
            type: "progress",
            stage: "classification",
            status: "running",
            message:
              "Your site's page structure couldn't be detected — it may require JavaScript to load. " +
              "Analysis will continue using competitor data.",
          });
        }
      },
    },
    {
      stage: "analysis",
      label: "Analyzing design patterns",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "analysis", status: "running", message: "Analyzing design patterns…", actions });
        const { analyses, failedUrls } = await runAnalyzer(ctx, onActions);
        ctx.sectionAnalyses = analyses;
        ctx.failedUrls = failedUrls;

        if (failedUrls.length > 0) {
          const hostnames = failedUrls.map((u) => getHostname(u));
          writer.send({
            type: "progress",
            stage: "analysis",
            status: "running",
            message: `Could not analyze ${hostnames.join(", ")} — excluded from comparison. Results may be incomplete.`,
          });
        }

        // ── Input coverage gate ──────────────────────────────────────
        // If the input page produced no findings, the scrape likely returned
        // thin/empty content (JS SPA not rendered). Surface a clear warning
        // so recommendations context is transparent to the user.
        const inputAnalyzed = (ctx.sectionAnalyses ?? [])
          .flatMap((sa) => sa.findings)
          .some((f) => f.site === "input");

        if (!inputAnalyzed) {
          writer.send({
            type: "progress",
            stage: "analysis",
            status: "running",
            message:
              "Your site's content couldn't be fully read — it may require JavaScript to load. " +
              "Recommendations will be based on your product description and competitor data.",
          });
        }
      },
    },
    {
      stage: "synthesis",
      label: "Synthesizing recommendations",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "synthesis", status: "running", message: "Synthesising insights…", actions });

        // Filter out competitors that failed analysis — prevents Agent 6 from
        // fabricating examples based on competitors it never actually analyzed.
        if (ctx.failedUrls?.length && ctx.competitors?.length) {
          const failedDomains = new Set(ctx.failedUrls.map((u) => getHostname(u)));
          ctx.competitors = ctx.competitors.filter((c) => !failedDomains.has(getHostname(c.url)));
        }

        const synthesis = await runSynthesis(ctx, onActions);
        ctx.recommendations = synthesis.recommendations;
        ctx.executiveSummary = synthesis.executiveSummary;
        ctx.overallScores = synthesis.overallScores;
        ctx.sectionAnalyses = synthesis.sections;
      },
    },
  ];

  try {
    for (const step of steps) {
      // Abort before starting a new step if the budget is nearly exhausted.
      // Prevents a silent Vercel hard-kill — user gets a clear error instead.
      if (Date.now() - pipelineStart > PIPELINE_BUDGET_MS) {
        writer.send({
          type: "error",
          message: "Analysis is taking too long. Please try again or try a different site.",
        });
        return;
      }

      // For the scraping step specifically: also abort if the scrape deadline has
      // already passed (Agents 0–2 consumed >210s). Starting Agent 3 at this point
      // would compress all per-scrape timeouts to 15s, causing widespread failures
      // and potentially hitting Vercel's hard 300s kill before the pipeline errors out.
      if (step.stage === "scraping" && Date.now() > scrapeDeadline) {
        writer.send({
          type: "error",
          message: "Analysis is taking too long. Please try again or try a different site.",
        });
        return;
      }

      writer.send({
        type: "progress",
        stage: step.stage,
        status: "running",
        message: `${step.label}…`,
      });

      const stepStart = Date.now();
      await withStepRetry(() => step.run(ctx), step.maxRetries ?? 1);
      console.log(`[pipeline] ${step.stage} completed in ${Date.now() - stepStart}ms`);

      writer.send({
        type: "progress",
        stage: step.stage,
        status: "done",
        message: `${step.label} — done`,
      });
    }

    console.log(`[pipeline] Total duration: ${Date.now() - pipelineStart}ms`);

    // Strip screenshotBase64 from pages before sending to client —
    // screenshots are used by Agent5 for analysis but no longer displayed in UI.
    // Each base64 image is ~1-3 MB; removing them cuts SSE payload by ~4-12 MB.
    const pagesWithoutScreenshots: PageData[] = ctx.pages!.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ screenshotBase64: _, ...rest }) => rest
    );

    const result: AnalysisResult = {
      productBrief: ctx.productBrief!,
      competitors: ctx.competitors!,
      pages: pagesWithoutScreenshots,
      sections: ctx.sectionAnalyses!,
      recommendations: ctx.recommendations!,
      executiveSummary: ctx.executiveSummary,
      overallScores: ctx.overallScores,
      pageSections: ctx.pageSections,
    };

    const quality = scoreAnalysisQuality(result);
    if (process.env.NODE_ENV !== "production") {
      console.log("[Uxio] Quality report:", JSON.stringify(quality, null, 2));
    }
    writer.send({ type: "complete", data: result, quality });
  } catch (err) {
    console.error("[pipeline] Fatal error:", err);
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    writer.send({ type: "error", message });
  } finally {
    writer.close();
  }
}
