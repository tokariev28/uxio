"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "./results/SectionCard";
import { RecommendationCard } from "./results/RecommendationCard";
import { SectionNavSidebar, type NavItem } from "./results/SectionNavSidebar";
import type {
  AnalysisResult,
  SectionAnalysis,
  SectionType,
} from "@/lib/types/analysis";

const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  features: "Features",
  socialProof: "Social Proof",
  pricing: "Pricing",
  cta: "Call to Action",
  footer: "Footer",
};

interface ResultsPanelProps {
  result: AnalysisResult;
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [showAllSections, setShowAllSections] = useState(false);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Score helpers ──────────────────────────────────────────────────────────
  const allFindings = result.sections.flatMap((s) => s.findings);

  const avgScore = (site: string): number | null => {
    const scores = allFindings
      .filter((f) => f.site === site)
      .map((f) => f.score);
    return scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
  };

  const scoreRows = [
    { label: "Your site", score: avgScore("input"), isYou: true },
    ...result.competitors.map((c) => ({
      label: c.name,
      score: avgScore(c.url) ?? avgScore(c.name),
      isYou: false,
    })),
  ]
    .filter(
      (r): r is { label: string; score: number; isYou: boolean } =>
        r.score !== null
    )
    .sort((a, b) => b.score - a.score);

  // ── Sort sections worst-first for input site ──────────────────────────────
  const sortedSections: SectionAnalysis[] = [...result.sections].sort(
    (a, b) => {
      const aScore = a.findings.find((f) => f.site === "input")?.score ?? 1;
      const bScore = b.findings.find((f) => f.site === "input")?.score ?? 1;
      return aScore - bScore;
    }
  );

  const visibleSections = showAllSections
    ? sortedSections
    : sortedSections.slice(0, 3);

  const hiddenCount = sortedSections.length - 3;

  // ── Sidebar nav items ─────────────────────────────────────────────────────
  const navItems: NavItem[] = sortedSections.map((section, i) => ({
    sectionIndex: i,
    label: SECTION_LABELS[section.sectionType] ?? section.sectionType,
    inputScore: section.findings.find((f) => f.site === "input")?.score ?? null,
  }));

  // ── IntersectionObserver — active section tracking ────────────────────────
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionRefs.current.forEach((el, index) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSectionIndex(index);
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, [visibleSections.length]);

  const handleNavClick = useCallback((index: number) => {
    sectionRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <div className="w-full">
      {/* ── Header zone ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
          Analysis complete
        </p>
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-primary)" }}
        >
          {result.productBrief.company}
        </h1>
        {result.pages[0]?.url && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {result.pages[0].url}
          </p>
        )}

        {/* Executive Summary */}
        {result.executiveSummary && (
          <blockquote className="mt-4 rounded-r-lg border-l-4 border-primary bg-muted/30 py-3 pl-4 pr-3">
            <p className="text-sm leading-relaxed text-foreground">
              {result.executiveSummary}
            </p>
          </blockquote>
        )}

        {/* Overall Score Bar Chart */}
        {scoreRows.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Score vs Competitors
            </h2>
            <div className="flex flex-col gap-2">
              {scoreRows.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-24 shrink-0 text-xs",
                      row.isYou
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.label}
                  </span>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        row.isYou ? "bg-blue-500" : "bg-muted-foreground/40"
                      )}
                      style={{ width: `${row.score * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(row.score * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator className="mb-8" />

      {/* ── Mobile pill nav ──────────────────────────────────────────────── */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {navItems.map((item) => (
          <button
            key={item.sectionIndex}
            onClick={() => handleNavClick(item.sectionIndex)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeSectionIndex === item.sectionIndex
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                item.inputScore === null
                  ? "bg-muted-foreground/30"
                  : item.inputScore < 0.6
                    ? "bg-red-500"
                    : item.inputScore < 0.8
                      ? "bg-amber-500"
                      : "bg-green-500"
              )}
            />
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="flex gap-8 items-start">
        {/* Sidebar — desktop only, sticky */}
        <aside className="hidden lg:block w-48 shrink-0 sticky top-6 self-start">
          <SectionNavSidebar
            items={navItems}
            activeIndex={activeSectionIndex}
            onClickItem={handleNavClick}
          />
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {/* Section cards */}
          {visibleSections.map((section, i) => (
            <div
              key={section.sectionType}
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
            >
              <SectionCard
                section={section}
                pages={result.pages}
                competitors={result.competitors}
                sectionIndex={i}
              />
            </div>
          ))}

          {/* Show more / less toggle */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllSections((prev) => !prev)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {showAllSections ? (
                <>
                  <ChevronUp className="size-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" />
                  Show {hiddenCount} more section{hiddenCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <section className="mt-2">
              <Separator className="mb-6" />
              <h2
                className="mb-4 text-lg font-semibold text-foreground"
                style={{ fontFamily: "var(--font-primary)" }}
              >
                Recommended Actions
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {result.recommendations.map((rec, i) => (
                  <RecommendationCard key={i} recommendation={rec} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
