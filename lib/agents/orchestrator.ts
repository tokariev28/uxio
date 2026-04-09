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
  run: (ctx: PipelineContext) => Promise<void>;
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
      },
    },
    {
      stage: "analysis",
      label: "Analyzing design patterns",
      run: async (ctx) => {
        const onActions = (actions: string[]) =>
          writer.send({ type: "progress", stage: "analysis", status: "running", message: "Analyzing design patterns…", actions });
        ctx.sectionAnalyses = await runAnalyzer(ctx, onActions);
      },
    },
    {
      stage: "synthesis",
      label: "Synthesizing recommendations",
      run: async (ctx) => {
        const synthesis = await runSynthesis(ctx);
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

      await step.run(ctx);

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
    console.log("[Uxio] Quality report:", JSON.stringify(quality, null, 2));
    writer.send({ type: "complete", data: result, quality });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    writer.send({ type: "error", message });
  } finally {
    writer.close();
  }
}
