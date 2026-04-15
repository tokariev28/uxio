"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { track } from "@vercel/analytics";
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

const heroContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.05 },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

type AppState = "idle" | "running" | "done" | "error";

function getFriendlyError(msg: string | null): string {
  if (!msg) return "Something went wrong. Please try again.";
  if (/too many requests|rate.?limit/i.test(msg))
    return "You've made too many requests in a short time. Please wait a minute and try again.";
  if (/API key|missing.*key|invalid.*key|authentication|unauthorized|401/i.test(msg))
    return "The analysis service isn't fully configured. If you're the site owner, please check environment variables in your Vercel dashboard.";
  if (/Server error 5/.test(msg))
    return "Something went wrong on our end. Please try again in a moment.";
  if (/Only HTTPS|private|internal|non-standard port/i.test(msg))
    return "This URL can't be analyzed. Make sure it's a public website with a standard address.";
  if (/unreachable|couldn't reach/i.test(msg))
    return "We couldn't reach this website. Double-check the URL and try again.";
  if (/taking too long|timed? out|budget/i.test(msg))
    return "Analysis is taking too long — this site's competitors may be slow to load. Please try again or try a different URL.";
  if (/unusable markdown|JavaScript rendering|bot.?detect|cloudflare|just a moment/i.test(msg))
    return "This site blocks automated tools, so we couldn't read its content. This is common on sites like Stripe, Cloudflare, or developer platforms. Try your own landing page or a standard SaaS site.";
  if (/tavily|search quer/i.test(msg))
    return "Competitor discovery failed — search service may be temporarily unavailable. Please try again in a moment.";
  if (/scrape any competitor|no competitor pages/i.test(msg))
    return "We couldn't load any competitor pages to compare against. This sometimes happens with less-known niches. Please try again or try a different URL.";
  if (/empty recommendations|synthesis failed/i.test(msg))
    return "The analysis completed but we couldn't generate recommendations. Please try again.";
  if (/failed to fetch|network/i.test(msg))
    return "Connection lost mid-analysis. Check your internet and try again.";
  return "Something went wrong while analyzing the page. Please try again.";
}

// ── localStorage cache helpers ─────────────────────────────────────────────
const CACHE_VERSION = 1;
const CACHE_PREFIX = `uxio:v${CACHE_VERSION}:cache:`;
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
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Lock heights to initial viewport so DevTools/keyboard don't compress the gradient or shift the gallery.
  useEffect(() => {
    const vh = `${window.innerHeight}px`;
    if (heroRef.current) heroRef.current.style.minHeight = vh;
    if (wrapperRef.current) wrapperRef.current.style.minHeight = vh;
  }, []);

  const prefersReducedMotion = useReducedMotion();

  // Abort in-flight SSE stream on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const { isGranted, isDenied, showBanner, showConfirmation, requestPermission, dismissBanner } =
    useNotification({
      isRunning: appState === "running",
      isComplete: appState === "done",
    });

  function normalizeUrl(raw: string): string {
    const s = raw.trim();
    if (!s) return s;
    let url: string;
    if (/^https:\/\//i.test(s)) url = s;
    else if (/^http:\/\//i.test(s)) url = "https://" + s.slice(7);
    else if (s.startsWith("//")) url = "https:" + s;
    else url = "https://" + s;
    // Strip trailing slashes to prevent duplicate cache keys (example.com/ === example.com)
    return url.replace(/\/+$/, "");
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
      // Non-blocking subpage warning — competitor discovery works best on root pages
      const { pathname } = parsed;
      if (pathname !== "/" && pathname !== "") {
        setUrlWarning("You're analyzing a subpage — your homepage gives the best competitor matching.");
      } else {
        setUrlWarning(null);
      }
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
        if (data.reason === "blocked") {
          setUrlError("This URL can't be analyzed — only public websites are supported.");
        } else {
          setUrlError("We couldn't reach this address. Check the URL and try again.");
        }
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

    const startTime = Date.now();
    track("analysis_started", { domain: new URL(trimmed).hostname });

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
            track("analysis_completed", {
              domain: new URL(trimmed).hostname,
              score: event.data.overallScores?.input ?? -1,
              sections: event.data.sections.length,
              duration_s: Math.round((Date.now() - startTime) / 1000),
            });
          } else if (event.type === "error") {
            setErrorMsg(event.message);
            setAppState("error");
            track("analysis_failed", { domain: new URL(trimmed).hostname });
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Connection lost mid-analysis. Check your internet and try again.");
      setAppState("error");
    }
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-col" style={{ minHeight: '100dvh' }}>
    <AnimatePresence mode="wait">
      {appState === "idle" ? (
        <motion.section
          ref={heroRef}
          key="hero"
          className="hero-wrapper"
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -20 }}
          transition={{ duration: 0.35, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            className="hero-content"
            variants={heroContainerVariants}
            initial={prefersReducedMotion ? "visible" : "hidden"}
            animate="visible"
          >
            <motion.div variants={heroItemVariants}>
              <Link href="/" aria-label="Uxio homepage">
                <Image src="/logo.svg" alt="Uxio" width={74} height={38} className="hero-logo" priority />
              </Link>
            </motion.div>
            <motion.h1 className="hero-heading" variants={heroItemVariants}>
              See your landing page<br />
              <em>through your competitor&apos;s eyes.</em>
            </motion.h1>
            <motion.p className="hero-subtitle" variants={heroItemVariants}>
              Uxio benchmarks your landing page against your actual competitors&nbsp;—<br />and shows you the exact gaps, ranked by impact
            </motion.p>
            <motion.div className="hero-form-area" variants={heroItemVariants}>
              <form onSubmit={handleSubmit} className="hero-form-wrapper">
                <label htmlFor="url-input" className="sr-only">Landing page URL</label>
                <input
                  id="url-input"
                  type="text"
                  className="hero-input"
                  placeholder="https://your-saas.com"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(null); setUrlWarning(null); }}
                  aria-describedby={urlError ? "url-error" : urlWarning ? "url-warning" : undefined}
                />
                <button
                  type="submit"
                  disabled={validating}
                  className="hero-submit"
                  aria-busy={validating}
                >
                  {validating ? "Checking…" : "Analyze"}
                </button>
              </form>
              {urlError && (
                <p id="url-error" role="alert" className="hero-url-error">
                  <AlertCircle className="size-4 shrink-0" />
                  {urlError}
                </p>
              )}
              {!urlError && urlWarning && (
                <p id="url-warning" role="status" className="hero-url-warning">
                  <AlertCircle className="size-4 shrink-0" />
                  {urlWarning}
                </p>
              )}
            </motion.div>
            <motion.div className="insight-cards-row" variants={heroItemVariants}>
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
            </motion.div>
          </motion.div>
        </motion.section>
      ) : (
        <motion.div
          key="analysis"
          className={cn(
            "flex flex-col items-center gap-6 w-full px-6 py-12",
            // Extra bottom padding when running so the fixed gallery doesn't overlap ProgressPanel
            appState === "running" && "pb-[340px]",
            appState === "done" && "max-w-5xl mx-auto"
          )}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          {appState === "running" && (
            <ProgressPanel
              stages={stages}
              notification={{
                isGranted,
                isDenied,
                showBanner,
                showConfirmation,
                onEnable: requestPermission,
                onDismiss: dismissBanner,
              }}
            />
          )}

          {appState === "error" && (
            <div className="flex flex-col items-center gap-6 text-center max-w-sm mx-auto py-8">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {getFriendlyError(errorMsg)}
              </p>
              <button
                onClick={() => { setAppState("idle"); setErrorMsg(null); }}
                className="bg-black text-white text-sm font-medium px-6 py-2.5 rounded-md hover:bg-black/80 transition-colors cursor-pointer"
              >
                Go back to Home
              </button>
            </div>
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

    <AnimatePresence>
      {appState === "running" && (
        // position: fixed keeps the gallery pinned to the viewport bottom regardless of
        // how many progress steps are shown above — fixes a Safari flex/min-height bug
        // where mt-auto doesn't resolve correctly. Safe here because the hero (which
        // needs stable min-height to prevent gradient jump) is not visible during running.
        <motion.div
          key="gallery"
          className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-auto">
            <InspirationGallery />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
