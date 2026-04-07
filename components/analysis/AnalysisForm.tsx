"use client";

import { useState, useRef } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ProgressPanel } from "./ProgressPanel";
import { ResultsPanel } from "./ResultsPanel";
import type {
  AgentStage,
  AnalysisResult,
  SSEEvent,
  StageStatus,
} from "@/lib/types/analysis";

interface StageState {
  status: StageStatus | "pending";
  message: string;
}

type AppState = "idle" | "running" | "done" | "error";

const isRateLimitError = (msg: string) => /429|rate.?limit/i.test(msg);

export function AnalysisForm() {
  const [url, setUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [stages, setStages] = useState<Partial<Record<AgentStage, StageState>>>(
    {}
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setStages({});
    setResult(null);
    setErrorMsg(null);
    setAppState("running");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        setErrorMsg(`Server error ${res.status}: ${text}`);
        setAppState("error");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event.type === "progress") {
            setStages((prev) => ({
              ...prev,
              [event.stage]: { status: event.status, message: event.message },
            }));
          } else if (event.type === "complete") {
            setResult(event.data);
            setAppState("done");
          } else if (event.type === "error") {
            setErrorMsg(event.message);
            setAppState("error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Unexpected error");
      setAppState("error");
    }
  }

  return (
    <div className={cn("flex flex-col gap-8 w-full", appState !== "done" && "max-w-2xl")}>
      <form onSubmit={handleSubmit} className="flex gap-2 w-full">
        <Input
          type="url"
          placeholder="https://your-saas.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={appState === "running"}
          className="flex-1"
          required
        />
        <button
          type="submit"
          disabled={appState === "running" || !url.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {appState === "running" ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {appState === "running" && <ProgressPanel stages={stages} />}

      {appState === "error" && errorMsg && (
        isRateLimitError(errorMsg) ? (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 flex items-start gap-2">
            <Clock className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Almost there — rate limit reached</p>
              <p className="mt-0.5 text-yellow-700">
                Gemini free tier allows 5 requests/min. The analysis retried automatically.
                If this persists, wait 1 minute and try again.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )
      )}

      {appState === "done" && result && <ResultsPanel result={result} />}
    </div>
  );
}
