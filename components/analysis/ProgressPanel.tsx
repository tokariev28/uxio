"use client";

import { Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
import type { AgentStage, StageStatus } from "@/lib/types/analysis";

const STAGE_LABELS: Record<AgentStage, string> = {
  "page-intelligence": "Understanding your product",
  discovery: "Finding competitors",
  validation: "Validating competitors",
  scraping: "Scraping pages",
  classification: "Classifying sections",
  analysis: "Analyzing design patterns",
  synthesis: "Synthesizing recommendations",
};

const STAGE_ORDER: AgentStage[] = [
  "page-intelligence",
  "discovery",
  "validation",
  "scraping",
  "classification",
  "analysis",
  "synthesis",
];

interface StageState {
  status: StageStatus | "pending";
  message: string;
}

interface ProgressPanelProps {
  stages: Partial<Record<AgentStage, StageState>>;
}

export function ProgressPanel({ stages }: ProgressPanelProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {STAGE_ORDER.map((stage) => {
        const state = stages[stage];
        const status = state?.status ?? "pending";

        return (
          <div key={stage} className="flex items-center gap-3 py-1">
            {status === "running" && (
              <Loader2 className="size-4 animate-spin text-primary shrink-0" />
            )}
            {status === "done" && (
              <CheckCircle2 className="size-4 text-green-500 shrink-0" />
            )}
            {status === "error" && (
              <XCircle className="size-4 text-destructive shrink-0" />
            )}
            {status === "pending" && (
              <Circle className="size-4 text-muted-foreground/40 shrink-0" />
            )}
            <span
              className={
                status === "pending"
                  ? "text-sm text-muted-foreground/40"
                  : status === "running"
                    ? "text-sm font-medium text-foreground"
                    : "text-sm text-muted-foreground"
              }
            >
              {state?.message ?? STAGE_LABELS[stage]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
