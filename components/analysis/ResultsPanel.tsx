"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { SectionCard } from "./results/SectionCard";
import { SectionNavSidebar, type NavItem } from "./results/SectionNavSidebar";
import { SummaryCard } from "./results/SummaryCard";
import { ExportPDFButton } from "./results/ExportPDFButton";
import type {
  AnalysisResult,
  SectionType,
} from "@/lib/types/analysis";
import { motion } from "framer-motion";


const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  navigation: "Navigation",
  features: "Features",
  benefits: "Benefits",
  socialProof: "Social Proof",
  testimonials: "Testimonials",
  integrations: "Integrations",
  howItWorks: "How It Works",
  pricing: "Pricing",
  faq: "FAQ",
  cta: "Call to Action",
  footer: "Footer",
  videoDemo: "Video Demo",
  comparison: "Comparison",
  metrics: "Metrics",
};

interface ResultsPanelProps {
  result: AnalysisResult;
  onReset?: () => void;
}

export function ResultsPanel({ result, onReset }: ResultsPanelProps) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Sort sections in actual page scroll order ──────────────────────────────
  // Agent 5 attaches scrollFraction from the input page's classified sections,
  // so we sort directly on it — no cross-reference with pageSections needed.
  const sortedSections = [...result.sections].sort(
    (a, b) => (a.scrollFraction ?? 1) - (b.scrollFraction ?? 1)
  );

  const inputUrl = result.pages[0]?.url;
  const inputPageSections = result.pageSections?.find((ps) => ps.url === inputUrl);
  const inputSectionTypes = new Set(
    inputPageSections?.sections.map((s) => s.type) ?? []
  );

  const visibleSections =
    inputSectionTypes.size > 0
      ? sortedSections.filter((s) => inputSectionTypes.has(s.sectionType))
      : sortedSections; // graceful fallback if pageSections unavailable

  // ── Sidebar nav items ─────────────────────────────────────────────────────
  const navItems: NavItem[] = visibleSections.map((section, i) => {
    const inputFinding = section.findings.find((f) => f.site === "input");
    const score = inputFinding != null ? Math.round(inputFinding.score * 100) : undefined;
    return {
      sectionIndex: i,
      label: SECTION_LABELS[section.sectionType] ?? section.sectionType,
      score,
    };
  });

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
      <motion.div
        className="flex flex-col mb-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Uxio logo — click to return home, centered */}
        <div className="flex justify-center mb-6">
          <button
            onClick={onReset}
            aria-label="Back to home"
            className="opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            style={{ background: "none", border: "none", padding: 0 }}
          >
            <Image
              src="/logo.svg"
              alt="Uxio"
              width={96}
              height={50}
              style={{ filter: "brightness(0)" }}
            />
          </button>
        </div>

        {/* Site info row: left = favicon + name + URL, right = export button */}
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-start gap-3 min-w-0">
            {result.pages[0]?.url && (
              <Image
                src={`https://www.google.com/s2/favicons?domain=${new URL(result.pages[0].url).hostname}&sz=32`}
                alt=""
                width={24}
                height={24}
                unoptimized
                className="rounded-sm shrink-0 mt-0.5"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <h1
                className="text-xl font-bold tracking-tight text-foreground leading-tight"
                style={{ fontFamily: "var(--font-primary)" }}
              >
                {result.productBrief.company}
              </h1>
              {result.pages[0]?.url && (
                <a
                  href={result.pages[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground truncate block transition-colors"
                >
                  {result.pages[0].url}
                </a>
              )}
            </div>
          </div>
          <ExportPDFButton result={result} />
        </div>

        <div className="mt-6 w-full border-t border-border/40" />
      </motion.div>

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
          {/* Summary card */}
          <SummaryCard result={result} />

          {/* Section cards */}
          {visibleSections.map((section, i) => (
            <div
              key={section.sectionType}
              className="snap-start scroll-mt-6"
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
            >
              <SectionCard
                section={section}
                competitors={result.competitors}
                recommendations={result.recommendations}
                sectionIndex={i}
              />
            </div>
          ))}



        </div>
      </div>
    </div>
  );
}
