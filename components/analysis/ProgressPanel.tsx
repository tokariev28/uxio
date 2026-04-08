"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Circle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentStage, StageStatus } from "@/lib/types/analysis";

/* ── Static data ────────────────────────────────────────────────────── */

const STAGE_LABELS: Record<AgentStage, string> = {
  "page-intelligence": "Reading the page",
  discovery: "Finding competitors",
  validation: "Validating competitors",
  scraping: "Scraping pages",
  classification: "Classifying sections",
  analysis: "Analysing design",
  synthesis: "Synthesising insights",
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

const SUB_STEPS: Record<AgentStage, string[]> = {
  "page-intelligence": [
    "Extracting product positioning\u2026",
    "Identifying target audience\u2026",
    "Mapping feature claims\u2026",
    "Understanding value proposition\u2026",
  ],
  discovery: [
    "Searching for similar products\u2026",
    "Cross-referencing market segments\u2026",
    "Evaluating candidate competitors\u2026",
  ],
  validation: [
    "Scoring ICP overlap\u2026",
    "Checking feature similarity\u2026",
    "Selecting top 3 matches\u2026",
  ],
  scraping: [
    "Capturing competitor layouts\u2026",
    "Taking full-page screenshots\u2026",
    "Processing visual content\u2026",
  ],
  classification: [
    "Identifying navigation patterns\u2026",
    "Detecting pricing structures\u2026",
    "Mapping content sections\u2026",
  ],
  analysis: [
    "Evaluating hero clarity\u2026",
    "Scoring CTA effectiveness\u2026",
    "Comparing visual hierarchy\u2026",
    "Assessing trust signals\u2026",
  ],
  synthesis: [
    "Ranking improvement opportunities\u2026",
    "Writing recommendations\u2026",
    "Calculating priority scores\u2026",
    "Preparing your report\u2026",
  ],
};

/** Varying rhythm so the cycling feels organic, not mechanical */
const INTERVALS = [2200, 2800, 2400, 3000];
const LAST_STEP_EXTRA_PAUSE = 800;

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ── Hooks ──────────────────────────────────────────────────────────── */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/* ── SubStepCycler ──────────────────────────────────────────────────── */

function SubStepCycler({
  stage,
  reducedMotion,
}: {
  stage: AgentStage;
  reducedMotion: boolean;
}) {
  const messages = SUB_STEPS[stage];
  const [index, setIndex] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIndex(0);
  }, [stage]);

  useEffect(() => {
    if (reducedMotion || messages.length <= 1) return;

    const isLast = index === messages.length - 1;
    const base = INTERVALS[index % INTERVALS.length];
    const delay = isLast ? base + LAST_STEP_EXTRA_PAUSE : base;

    timeoutRef.current = setTimeout(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [index, messages, reducedMotion]);

  if (reducedMotion) {
    return (
      <span className="text-sm text-muted-foreground/70">{messages[0]}</span>
    );
  }

  return (
    <div className="h-5 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span
          key={`${stage}-${index}`}
          className="text-sm text-muted-foreground/70 block"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {messages[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ── ProgressPanel ──────────────────────────────────────────────────── */

interface StageState {
  status: StageStatus | "pending";
  message: string;
}

interface ProgressPanelProps {
  stages: Partial<Record<AgentStage, StageState>>;
}

export function ProgressPanel({ stages }: ProgressPanelProps) {
  const reducedMotion = useReducedMotion();

  // Progressive reveal: only show stages that have been reached + 1 upcoming
  const lastActiveIdx = STAGE_ORDER.reduce((acc, stage, idx) => {
    const s = stages[stage]?.status;
    return s === "running" || s === "done" || s === "error" ? idx : acc;
  }, -1);
  const naturalTarget = Math.min(
    Math.max(lastActiveIdx + 2, 1),
    STAGE_ORDER.length
  );
  const [visibleCount, setVisibleCount] = useState(1);
  useEffect(() => {
    setVisibleCount((prev) => Math.max(prev, naturalTarget));
  }, [naturalTarget]);

  return (
    <div className="progress-container relative w-full max-w-md mx-auto py-6">
      {!reducedMotion && <div className="ambient-glow" />}

      <div className="flex flex-col gap-0.5">
        {STAGE_ORDER.slice(0, visibleCount).map((stage, idx) => {
          const state = stages[stage];
          const status = state?.status ?? "pending";

          return (
            <motion.div
              key={stage}
              layout
              initial={!reducedMotion && idx > 0 ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ layout: { duration: 0.3, ease: EASE }, duration: 0.4, ease: EASE }}
            >
              {status === "done" && (
                <div className="flex items-center gap-2.5 py-1">
                  <CheckCircle2 className="size-3.5 text-green-500/70 shrink-0" />
                  <span className="text-xs text-muted-foreground/50">
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
              )}

              {status === "running" && (
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex gap-3 py-3"
                >
                  <motion.div
                    className="shrink-0 self-start mt-0.5"
                    animate={reducedMotion ? {} : { scale: [1, 1.12, 1] }}
                    transition={
                      reducedMotion
                        ? {}
                        : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                    }
                  >
                    <img
                      src="/favicon.svg"
                      width={16}
                      height={16}
                      alt=""
                      aria-hidden="true"
                    />
                  </motion.div>
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span
                      className={`text-base font-medium text-foreground ${
                        !reducedMotion ? "shimmer-text" : ""
                      }`}
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                    <SubStepCycler
                      stage={stage}
                      reducedMotion={reducedMotion}
                    />
                  </div>
                </motion.div>
              )}

              {status === "error" && (
                <div className="flex items-center gap-2.5 py-1.5">
                  <XCircle className="size-3.5 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">
                    {state?.message ?? STAGE_LABELS[stage]}
                  </span>
                </div>
              )}

              {status === "pending" && (
                <div className="flex items-center gap-2.5 py-1">
                  <Circle className="size-3.5 text-muted-foreground/25 shrink-0" />
                  <span className="text-sm text-muted-foreground/30">
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
