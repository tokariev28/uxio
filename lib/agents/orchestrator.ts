import type {
  PipelineContext,
  AnalysisResult,
  AgentStage,
  PageData,
} from "@/lib/types/analysis";
import { scoreAnalysisQuality } from "@/lib/utils/quality-scorer";
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

  const steps: AgentStep[] = [
    {
      stage: "page-intelligence",
      label: "Understanding your product",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "page-intelligence", status: "running", message: "Understanding your product…", actions });
        ctx.productBrief = await runAgent0(ctx.inputUrl, onActions);
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
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "scraping", status: "running", message: "Scraping pages…", actions });
        ctx.pages = await runScraper(ctx, onActions);
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
        const inputSections = ctx.pageSections?.find((ps) => {
          try {
            return new URL(ps.url).hostname.replace(/^www\./, "") === new URL(ctx.inputUrl).hostname.replace(/^www\./, "");
          } catch {
            return ps.url === ctx.inputUrl;
          }
        });
        if (!inputSections?.sections.length) {
          writer.send({
            type: "progress",
            stage: "classification",
            status: "running",
            message:
              "Input page sections could not be classified — page may use client-side rendering. " +
              "Analysis will proceed with competitor data only.",
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
          const hostnames = failedUrls.map((u) => {
            try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
          });
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
              "Input page sections could not be analyzed — page may use client-side rendering. " +
              "Recommendations will be based on product brief and competitor data only.",
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
          const failedDomains = new Set(
            ctx.failedUrls.map((u) => {
              try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
            })
          );
          ctx.competitors = ctx.competitors.filter((c) => {
            try { return !failedDomains.has(new URL(c.url).hostname.replace(/^www\./, "")); } catch { return true; }
          });
        }

        const synthesis = await runSynthesis(ctx, onActions);
        ctx.recommendations = synthesis.recommendations;
        ctx.executiveSummary = synthesis.executiveSummary;
        ctx.overallScores = synthesis.overallScores;
      },
    },
  ];

  try {
    for (const step of steps) {
      writer.send({
        type: "progress",
        stage: step.stage,
        status: "running",
        message: `${step.label}…`,
      });

      await withStepRetry(() => step.run(ctx), step.maxRetries ?? 1);

      writer.send({
        type: "progress",
        stage: step.stage,
        status: "done",
        message: `${step.label} — done`,
      });
    }

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
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    writer.send({ type: "error", message });
  } finally {
    writer.close();
  }
}
