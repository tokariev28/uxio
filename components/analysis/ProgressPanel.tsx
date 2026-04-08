"use client";

import { useState, useEffect } from "react";
import { XCircle, Circle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { AgentStage, StageStatus } from "@/lib/types/analysis";
import { InspirationGallery } from "./InspirationGallery";

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

/* ── Types ──────────────────────────────────────────────────────────── */

interface StageState {
  status: StageStatus | "pending";
  message: string;
  actions?: string[];
}

interface NotificationProps {
  showBanner: boolean;
  showConfirmation: boolean;
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

interface ProgressPanelProps {
  stages: Partial<Record<AgentStage, StageState>>;
  notification?: NotificationProps;
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
  const [visibleCount, setVisibleCount] = useState(1);
  useEffect(() => {
    setVisibleCount((prev) => Math.max(prev, naturalTarget));
  }, [naturalTarget]);

  const anyRunning = STAGE_ORDER.some((s) => stages[s]?.status === "running");

  return (
    <>
      <div className="progress-container relative w-full max-w-md mx-auto py-6">
        {/* Spinner header — visible while any stage is running */}
        {anyRunning && (
          <div className="flex items-center gap-2 mb-4">
            <div className="size-3.5 rounded-full border-[1.5px] border-border border-t-foreground/40 animate-spin flex-shrink-0" />
            <span className="text-sm text-muted-foreground italic">Working…</span>
          </div>
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
                    <span className="text-xs text-muted-foreground/50">
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                )}

                {status === "running" && (
                  <>
                    <div className="flex items-start gap-2.5 py-2">
                      <span className="size-2 rounded-full bg-blue-500 flex-shrink-0 mt-[3px]" />
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-sm text-foreground">
                          {STAGE_LABELS[stage]}
                        </span>
                        {actions && actions.length > 0 && (
                          <div className="border-l-2 border-border/40 pl-2.5 flex flex-wrap gap-1.5">
                            {actions.map((action) => (
                              <span
                                key={action}
                                className="font-mono text-[10.5px] text-muted-foreground/70 border border-muted-foreground/20 rounded px-1.5 py-0.5 bg-transparent"
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {notification?.showBanner && (
                        <motion.div
                          key="notif-banner"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.3, ease: EASE }}
                          className="mb-1 rounded-md border border-border/50 bg-card/60 px-3 py-2.5"
                        >
                          <p className="text-xs text-muted-foreground mb-2">
                            Get notified when analysis is ready — even if you switch tabs
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={notification.onEnable}
                              className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              Enable notifications
                            </button>
                            <button
                              onClick={notification.onDismiss}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Not now
                            </button>
                          </div>
                        </motion.div>
                      )}
                      {notification?.showConfirmation && (
                        <motion.p
                          key="notif-confirm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE }}
                          className="mb-1 text-xs text-green-500/80"
                        >
                          ✓ You&apos;ll be notified
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </>
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
      <InspirationGallery />
    </>
  );
}
