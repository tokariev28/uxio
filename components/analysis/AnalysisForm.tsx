"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ProgressPanel } from "./ProgressPanel";
import { ResultsPanel } from "./ResultsPanel";
import { InspirationGallery } from "./InspirationGallery";
import { useNotification } from "@/lib/hooks/useNotification";
import type {
  AgentStage,
  AnalysisResult,
  SSEEvent,
  StageState,
} from "@/lib/types/analysis";

const INSIGHT_CARDS = [
  {
    id: "left",
    priority: "high",
    title: "Social proof below the fold",
    body: "Apollo places logos only at the bottom. Users don't scroll — trust never builds.",
    action: "Move G2 badges and customer logos directly into the hero section.",
    impact: "Lifts first-visit trust signals above the scroll threshold.",
  },
  {
    id: "center",
    priority: "critical",
    title: "Two competing primary CTAs",
    body: "Apollo's hero shows 'Get started' and 'Watch demo' at equal visual weight — attention is split.",
    action: "Make 'Get started free' the sole primary CTA. Demote 'Watch demo' to a text link.",
    impact: "Reduces decision fatigue; focuses conversion on a single action.",
  },
  {
    id: "right",
    priority: "medium",
    title: "Value prop skips the 'who for'",
    body: "Apollo's headline answers what the tool does, but not which team it's for.",
    action: "Add 'for B2B revenue teams' directly in the subheadline for persona clarity.",
    impact: "Improves qualified visitor resonance and reduces bounce from wrong-fit traffic.",
  },
] as const;

type AppState = "idle" | "running" | "done" | "error";

const isRateLimitError = (msg: string) => /429|rate.?limit/i.test(msg);

// ── localStorage cache helpers ─────────────────────────────────────────────
const CACHE_PREFIX = "uxio:cache:";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCachedResult(url: string): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw) as { data: AnalysisResult; expiresAt: number };
    if (Date.now() > expiresAt) {
      localStorage.removeItem(CACHE_PREFIX + url);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedResult(url: string, result: AnalysisResult): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + url,
      JSON.stringify({ data: result, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch {
    // localStorage full or unavailable — ignore
  }
}

export function AnalysisForm() {
  const [url, setUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [stages, setStages] = useState<Partial<Record<AgentStage, StageState>>>(
    {}
  );
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { isGranted, showBanner, showConfirmation, requestPermission, dismissBanner } =
    useNotification({
      isRunning: appState === "running",
      isComplete: appState === "done",
    });

  function normalizeUrl(raw: string): string {
    const s = raw.trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("//")) return "https:" + s;
    return "https://" + s;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizeUrl(url);
    if (!trimmed) {
      setUrlError("Enter your landing page URL to get started.");
      return;
    }

    // Client-side format check
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname.includes(".")) throw new Error("no tld");
    } catch {
      setUrlError("That doesn't look like a valid URL. Try https://example.com");
      return;
    }

    // Reachability check
    setValidating(true);
    setUrlError(null);
    try {
      const res = await fetch("/api/validate-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!data.valid) {
        setUrlError("We couldn't reach this address. Check the URL and try again.");
        return;
      }
    } catch {
      // Network failure reaching our own API — skip validation and proceed
    } finally {
      setValidating(false);
    }

    // Cache hit — show results immediately, skip full analysis
    const cached = getCachedResult(trimmed);
    if (cached) {
      setResult(cached);
      setErrorMsg(null);
      setAppState("done");
      return;
    }

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
            setCachedResult(trimmed, event.data);
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
    <>
    <AnimatePresence mode="wait">
      {appState === "idle" ? (
        <motion.section
          key="hero"
          className="hero-wrapper"
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.35, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="hero-content">
            <Link href="/">
              <Image src="/logo.svg" alt="Uxio" width={74} height={38} className="hero-logo" />
            </Link>
            <h1 className="hero-heading">
              See your landing page<br />
              <em>through your competitor&apos;s eyes.</em>
            </h1>
            <p className="hero-subtitle">
              Uxio benchmarks your landing page against your actual competitors&nbsp;—<br />and shows you the exact gaps, ranked by impact
            </p>
            <div className="hero-form-area">
              <form onSubmit={handleSubmit} className="hero-form-wrapper">
                <input
                  type="text"
                  className="hero-input"
                  placeholder="https://your-saas.com"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                />
                <button
                  type="submit"
                  disabled={validating}
                  className="hero-submit"
                >
                  {validating ? "Checking…" : "Analyze"}
                </button>
              </form>
              {urlError && (
                <p className="hero-url-error">
                  <AlertCircle className="size-4 shrink-0" />
                  {urlError}
                </p>
              )}
            </div>
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
                  <div className="insight-card-body-wrap">
                    <div className={cn("insight-card-priority", `insight-card-priority--${card.priority}`)}>
                      <span className="insight-card-priority-dot" />
                      {card.priority}
                    </div>
                    <p className="insight-card-title">{card.title}</p>
                    <p className="insight-card-body">{card.body}</p>
                  </div>
                  <div className="insight-card-recommendation">
                    <p className="insight-card-recommendation-label">Recommendation</p>
                    <p className="insight-card-recommendation-text">{card.action}</p>
                    <p className="insight-card-impact">↳ {card.impact}</p>
                  </div>
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
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          {appState === "error" && (
            <form onSubmit={handleSubmit} className="hero-form-wrapper">
              <input
                type="text"
                className="hero-input"
                placeholder="https://your-saas.com"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
              />
              <button
                type="submit"
                disabled={validating}
                className="hero-submit"
              >
                {validating ? "Checking…" : "Analyze"}
              </button>
            </form>
          )}

          {appState === "running" && (
            <ProgressPanel
              stages={stages}
              notification={{
                isGranted,
                showBanner,
                showConfirmation,
                onEnable: requestPermission,
                onDismiss: dismissBanner,
              }}
            />
          )}

          {appState === "error" && errorMsg && (
            isRateLimitError(errorMsg) ? (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 flex items-start gap-2">
                <Clock className="size-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Almost there — rate limit reached</p>
                  <p className="mt-0.5 text-yellow-700">
                    The AI provider is temporarily overloaded. Please wait a moment and try again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )
          )}

          {appState === "done" && result && (
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              <ResultsPanel
                result={result}
                onReset={() => {
                  setAppState("idle");
                  setResult(null);
                  setStages({});
                  setErrorMsg(null);
                }}
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>

    {appState === "running" && (
      <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <InspirationGallery />
        </div>
      </div>
    )}
    </>
  );
}
