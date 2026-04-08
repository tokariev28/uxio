"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ProgressPanel } from "./ProgressPanel";
import { ResultsPanel } from "./ResultsPanel";
import type {
  AgentStage,
  AnalysisResult,
  SSEEvent,
  StageState,
} from "@/lib/types/analysis";

const INSIGHT_CARDS = [
  {
    id: "left",
    tag: "Trust",
    title: "Social Proof Positioning",
    body: "Trust signals below the fold increase bounce. Moving logos up-funnel helps significantly.",
    impact: "↑ High conversion impact",
  },
  {
    id: "center",
    tag: "CTA",
    title: "CTA Hierarchy",
    body: "Two equal CTAs compete for attention. Single dominant action lifts clicks 20–35%.",
    impact: "↑ +20–35% click-through",
  },
  {
    id: "right",
    tag: "Hero",
    title: "Value Proposition Clarity",
    body: "Hero answers 'what' but not 'who for'. Persona context lifts qualified conversions.",
    impact: "↑ Medium-high impact",
  },
] as const;

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
              [event.stage]: {
                status: event.status,
                message: event.message,
                actions: event.actions ?? prev[event.stage]?.actions,
              },
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
    <AnimatePresence mode="wait">
      {appState === "idle" ? (
        <motion.section
          key="hero"
          className="hero-wrapper"
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="hero-content">
            <Link href="/">
              <img src="/logo.svg" alt="Uxio" width={74} height={38} className="hero-logo" />
            </Link>
            <h1 className="hero-heading">
              The honest audit<br />
              <em>your landing page needs.</em>
            </h1>
            <p className="hero-subtitle">
              Paste any URL. Get a structured critique against top-performing pages — hero, CTA, trust signals, and more.
            </p>
            <form onSubmit={handleSubmit} className="hero-form-wrapper">
              <input
                type="url"
                className="hero-input"
                placeholder="https://your-saas.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="hero-submit"
              >
                Analyze
              </button>
            </form>
            <div className="insight-cards-row">
              {INSIGHT_CARDS.map((card) => (
                <div
                  key={card.id}
                  className={cn(
                    "insight-card",
                    card.id === "center" && "insight-card-center",
                    card.id === "left" && "insight-card-left",
                    card.id === "right" && "insight-card-right",
                  )}
                >
                  <span className="insight-card-tag">{card.tag}</span>
                  <p className="insight-card-title">{card.title}</p>
                  <p className="insight-card-body">{card.body}</p>
                  <p className="insight-card-impact">{card.impact}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      ) : (
        <motion.div
          key="analysis"
          className={cn(
            "flex flex-col items-center gap-6 w-full px-6 py-12",
            appState === "done" && "max-w-5xl mx-auto"
          )}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {appState !== "running" && (
            <form onSubmit={handleSubmit} className="hero-form-wrapper">
              <input
                type="url"
                className="hero-input"
                placeholder="https://your-saas.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="hero-submit"
              >
                Analyze
              </button>
            </form>
          )}

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
