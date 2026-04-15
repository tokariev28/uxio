"use client";

import { useState, useEffect } from "react";
import { XCircle, Circle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { AgentStage, StageState } from "@/lib/types/analysis";

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

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ── Dynamic ETA ─────────────────────────────────────────────────────── */
// Updated only on stage transitions — no per-second ticking.
// Coarse buckets are intentional: we don't have second-level accuracy.
const STAGE_ETA: Partial<Record<AgentStage, string>> = {
  "page-intelligence": "Takes about 3 minutes.",
  discovery:           "Takes about 3 minutes.",
  validation:          "Takes about 3 minutes.",
  scraping:            "Takes about 2 minutes.",
  classification:      "Almost halfway through.",
  analysis:            "About a minute left.",
  synthesis:           "Almost done.",
};

/* ── Types ──────────────────────────────────────────────────────────── */

interface NotificationProps {
  isGranted: boolean;
  isDenied: boolean;
  showBanner: boolean;
  showConfirmation: boolean;
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

interface ProgressPanelProps {
  stages: Partial<Record<AgentStage, StageState>>;
  notification?: NotificationProps;
}

/* ── AnimatedDots ───────────────────────────────────────────────────── */

function AnimatedDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const frames = [".", "..", "..."];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % frames.length;
      setDots(frames[i]);
    }, 500);
    return () => clearInterval(id);
  }, []);
  return <span className="text-muted-foreground/50">{dots}</span>;
}

/* ── ProgressPanel ──────────────────────────────────────────────────── */

export function ProgressPanel({ stages, notification }: ProgressPanelProps) {
  const reducedMotion = useReducedMotion();

  // Progressive reveal: show stages reached + 1 upcoming
  const lastActiveIdx = STAGE_ORDER.reduce((acc, stage, idx) => {
    const s = stages[stage]?.status;
    return s === "running" || s === "done" || s === "error" ? idx : acc;
  }, -1);
  const naturalTarget = Math.min(
    Math.max(lastActiveIdx + 2, 1),
    STAGE_ORDER.length
  );
  const visibleCount = naturalTarget;

  const anyRunning = STAGE_ORDER.some((s) => stages[s]?.status === "running");
  const currentStage = STAGE_ORDER.find((s) => stages[s]?.status === "running");
  const etaText = currentStage ? STAGE_ETA[currentStage] : "About 3 minutes to go";

  return (
    <div className="progress-container relative w-full max-w-md mx-auto py-6">
        {anyRunning && (
          <p className="mb-5" style={{ fontSize: 13, color: "#525252", lineHeight: 1.55 }}>
            {etaText}
            {notification?.showConfirmation && notification?.isGranted ? (
              <AnimatePresence>
                <motion.span
                  key="confirmed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ color: "#15803d", marginLeft: 4 }}
                >
                  ✓ You&apos;ll be notified.
                </motion.span>
              </AnimatePresence>
            ) : notification?.showConfirmation && notification?.isDenied ? (
              <AnimatePresence>
                <motion.span
                  key="denied"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ color: "#737373", marginLeft: 4 }}
                >
                  Notifications blocked. We&apos;ll update the tab title instead.
                </motion.span>
              </AnimatePresence>
            ) : notification?.isGranted ? (
              <span style={{ marginLeft: 4 }}>
                We&apos;ll notify you when it&apos;s complete.
              </span>
            ) : notification?.showBanner ? (
              <>
                {" "}
                <button
                  onClick={notification.onEnable}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "inherit",
                    color: "#4a60a0",
                    textDecoration: "underline",
                    textDecorationStyle: "dotted",
                    textDecorationColor: "#4a60a0",
                    textUnderlineOffset: 3,
                  }}
                >
                  Allow us to notify you when it&apos;s ready.
                </button>
              </>
            ) : null}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {STAGE_ORDER.slice(0, visibleCount).map((stage, idx) => {
            const state = stages[stage];
            const status = state?.status ?? "pending";
            const actions = state?.actions;

            return (
              <motion.div
                key={stage}
                layout
                initial={!reducedMotion && idx > 0 ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  layout: { duration: 0.3, ease: EASE },
                  duration: 0.4,
                  ease: EASE,
                }}
              >
                {status === "done" && (
                  <div className="flex items-center gap-2.5 py-1">
                    <span className="size-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-xs text-muted-foreground/70">
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                )}

                {status === "running" && (
                  <div className="flex items-start gap-2.5 py-2">
                    <svg className="size-3.5 animate-spin flex-shrink-0 mt-[1px]" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                      <path d="M14.3331 4L17.6509 4.00451L17.6516 9.24162C19.8073 8.82976 20.5851 8.34036 22.4033 7.20749L23.2962 6.33786C24.0687 7.11002 24.8874 7.90426 25.6434 8.68704L19.9838 14.3408L27.9824 14.3385L27.9827 17.6411L19.9887 17.6422L25.6442 23.2954L23.2967 25.6434C23.0612 25.4127 22.6386 24.9697 22.4039 24.7719C22.0649 24.5918 21.5291 24.2211 21.1604 24.0057C19.9519 23.2996 18.9999 23.0233 17.6522 22.7276V27.9792L14.3293 27.9796C14.3273 26.2579 14.2965 24.446 14.3388 22.7312C13.264 22.9654 12.5976 23.1244 11.5888 23.5807C11.1959 23.7582 9.809 24.6763 9.63701 24.7158C9.46149 24.8593 8.87441 25.461 8.68658 25.6449L6.33786 23.2954L11.9894 17.6396L4.00117 17.6384L4 14.3371L11.991 14.3369L6.33628 8.68281L8.681 6.33428L9.73811 7.37302C10.0276 7.40172 10.8865 8.06562 11.3431 8.27858C12.4493 8.79431 13.1731 8.99212 14.3436 9.25254C14.3051 7.52553 14.3307 5.73181 14.3331 4Z" fill="currentColor" />
                    </svg>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-sm text-foreground">
                        {STAGE_LABELS[stage]}<AnimatedDots />
                      </span>
                      {actions && actions.length > 0 ? (
                        <div className="border-l-2 border-border/40 pl-2.5 flex flex-wrap gap-1.5">
                          {actions.map((action) => (
                            <motion.span
                              key={action}
                              initial={reducedMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.35, ease: "easeOut" }}
                              className="font-mono text-[10.5px] text-muted-foreground/70 border border-muted-foreground/20 rounded px-1.5 py-0.5 bg-transparent"
                            >
                              {action}
                            </motion.span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
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
