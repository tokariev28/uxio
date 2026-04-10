"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Recommendation, Priority, Competitor } from "@/lib/types/analysis";
import { toSentenceCase } from "@/lib/utils";

interface InsightSliderProps {
  insights: Recommendation[];
  competitors?: Competitor[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function renderReasoningText(text: string, competitors: Competitor[]) {
  const named = competitors.filter((c) => c.name);
  if (!named.length) return text;

  const escaped = named.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(pattern);
  const seen = new Set<string>();

  return parts.map((part, i) => {
    const comp = named.find((c) => c.name === part);
    if (!comp) return part;

    const isFirst = !seen.has(comp.name);
    seen.add(comp.name);
    const domain = getDomain(comp.url);

    return (
      <a
        key={i}
        href={comp.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          verticalAlign: "middle",
          color: "#111",
          textDecoration: "none",
          borderBottom: "1px dashed #9ca3af",
          cursor: "pointer",
        }}
      >
        {isFirst && domain && (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
            width={14}
            height={14}
            alt=""
            style={{ borderRadius: 2, verticalAlign: "middle" }}
          />
        )}
        <strong style={{ fontWeight: 600 }}>{part}</strong>
      </a>
    );
  });
}

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#dc2626",
  high: "#d97706",
  medium: "#16a34a",
};

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

export function InsightSlider({ insights, competitors = [] }: InsightSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp for display — avoids setState-in-effect anti-pattern
  const safeIndex = insights.length > 0 ? Math.min(currentIndex, insights.length - 1) : 0;

  const goTo = useCallback(
    (index: number) => {
      if (index === currentIndex) return;
      setDirection(index > currentIndex ? 1 : -1);
      setCurrentIndex(index);
    },
    [currentIndex],
  );

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const goNext = useCallback(() => {
    if (currentIndex < insights.length - 1) goTo(currentIndex + 1);
  }, [currentIndex, insights.length, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [goPrev, goNext]);

  if (insights.length === 0) return null;

  const insight = insights[safeIndex];

  return (
    <div ref={containerRef} tabIndex={0} style={{ outline: "none" }}>
      {/* ── Insight card ──────────────────────────────────────────── */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={safeIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {/* Body */}
              <div style={{ padding: "24px 26px 14px" }}>
                {/* Priority + Confidence */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 14,
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: PRIORITY_COLORS[insight.priority],
                    }}
                  />
                  <span style={{ color: PRIORITY_COLORS[insight.priority] }}>
                    {insight.priority}
                  </span>
                  {typeof insight.confidence === "number" && (
                    <>
                      <span style={{ color: "#d1d5db" }}>·</span>
                      <span
                        style={{
                          color: insight.confidence >= 0.7 ? "#16a34a" : insight.confidence >= 0.4 ? "#d97706" : "#dc2626",
                        }}
                      >
                        {insight.confidence >= 0.7 ? "High confidence" : insight.confidence >= 0.4 ? "Medium confidence" : "Low confidence"}
                      </span>
                    </>
                  )}
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontSize: 19,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: "#111",
                    marginBottom: 12,
                    letterSpacing: "-0.025em",
                  }}
                >
                  {toSentenceCase(insight.title)}
                </h3>

                {/* Reasoning with inline competitor highlights */}
                <p style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.7, color: "#64748b" }}>
                  {renderReasoningText(insight.reasoning, competitors)}
                </p>
              </div>

              {/* Recommendation block (card-in-card) */}
              {insight.suggestedAction && (
                <div
                  style={{
                    margin: "14px 26px 24px",
                    background: "#f7f7f8",
                    borderRadius: 12,
                    padding: "16px 18px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#6b7280",
                      marginBottom: 6,
                    }}
                  >
                    Recommendation
                  </p>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#111",
                      lineHeight: 1.5,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {insight.suggestedAction}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Navigation below card ────────────────────────────────── */}
      {insights.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 14,
          }}
        >
          {/* Counter — left */}
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#6b7280",
              fontVariantNumeric: "tabular-nums",
              minWidth: 32,
            }}
          >
            {safeIndex + 1} / {insights.length}
          </span>

          {/* Dots — center */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {insights.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Go to insight ${i + 1}`}
                  style={{
                    width: i === safeIndex ? 18 : 5,
                    height: 5,
                    borderRadius: 3,
                    background: i === safeIndex ? "#9ca3af" : "#e5e5e5",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "all 250ms ease",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Arrows — right */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <button
              onClick={goPrev}
              disabled={safeIndex === 0}
              aria-label="Previous insight"
              onMouseEnter={(e) => { if (safeIndex !== 0) (e.currentTarget as HTMLButtonElement).style.background = "#e5e7eb"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: "#f3f4f6",
                cursor: safeIndex === 0 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: safeIndex === 0 ? 0.35 : 1,
                transition: "all 150ms ease",
              }}
            >
              <ChevronLeft size={12} color="#374151" />
            </button>
            <button
              onClick={goNext}
              disabled={safeIndex === insights.length - 1}
              aria-label="Next insight"
              onMouseEnter={(e) => { if (safeIndex !== insights.length - 1) (e.currentTarget as HTMLButtonElement).style.background = "#e5e7eb"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: "#f3f4f6",
                cursor: safeIndex === insights.length - 1 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: safeIndex === insights.length - 1 ? 0.35 : 1,
                transition: "all 150ms ease",
              }}
            >
              <ChevronRight size={12} color="#374151" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
