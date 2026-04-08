import type {
  PipelineContext,
  AnalysisResult,
  AgentStage,
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
        ctx.productBrief = await runAgent0(ctx.inputUrl);
      },
    },
    {
      stage: "discovery",
      label: "Finding competitors",
      run: async (ctx) => {
        ctx.candidates = await runDiscovery(ctx);
      },
    },
    {
      stage: "validation",
      label: "Validating and ranking competitors",
      run: async (ctx) => {
        ctx.competitors = await runValidator(ctx);
      },
    },
    {
      stage: "scraping",
      label: "Scraping pages",
      run: async (ctx) => {
        ctx.pages = await runScraper(ctx);
      },
    },
    {
      stage: "classification",
      label: "Classifying page sections",
      run: async (ctx) => {
        ctx.pageSections = await runClassifier(ctx);
      },
    },
    {
      stage: "analysis",
      label: "Analyzing design patterns",
      run: async (ctx) => {
        ctx.sectionAnalyses = await runAnalyzer(ctx);
      },
    },
    {
      stage: "synthesis",
      label: "Synthesizing recommendations",
      run: async (ctx) => {
        const synthesis = await runSynthesis(ctx, (delaySecs) => {
          writer.send({
            type: "progress",
            stage: "synthesis",
            status: "running",
            message: `Rate limit hit — retrying in ${delaySecs}s…`,
          });
        });
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

    const result: AnalysisResult = {
      productBrief: ctx.productBrief!,
      competitors: ctx.competitors!,
      pages: ctx.pages!,
      sections: ctx.sectionAnalyses!,
      recommendations: ctx.recommendations!,
      executiveSummary: ctx.executiveSummary,
      overallScores: ctx.overallScores,
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
