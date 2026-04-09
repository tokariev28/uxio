"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { SectionCard } from "./results/SectionCard";
import { SectionNavSidebar, type NavItem } from "./results/SectionNavSidebar";
import type {
  AnalysisResult,
  SectionType,
} from "@/lib/types/analysis";


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
};

const SECTION_ORDER: SectionType[] = [
  "hero", "navigation", "features", "benefits",
  "socialProof", "testimonials", "integrations",
  "howItWorks", "pricing", "faq", "cta", "footer",
];

interface ResultsPanelProps {
  result: AnalysisResult;
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Sort sections in canonical page order ──────────────────────────────────
  const sortedSections = [...result.sections].sort(
    (a, b) => {
      const ai = SECTION_ORDER.indexOf(a.sectionType);
      const bi = SECTION_ORDER.indexOf(b.sectionType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
  );

  // Filter to only sections found on the input site (pageSections[0] = input page).
  // This prevents competitor-only sections from appearing in the nav.
  const inputSectionTypes = new Set(
    result.pageSections?.[0]?.sections.map((s) => s.type) ?? []
  );
  const visibleSections =
    inputSectionTypes.size > 0
      ? sortedSections.filter((s) => inputSectionTypes.has(s.sectionType))
      : sortedSections; // graceful fallback if pageSections unavailable

  // ── Sidebar nav items ─────────────────────────────────────────────────────
  const navItems: NavItem[] = visibleSections.map((section, i) => ({
    sectionIndex: i,
    label: SECTION_LABELS[section.sectionType] ?? section.sectionType,
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
        <div className="flex items-center gap-2.5">
          {result.pages[0]?.url && (
            <Image
              src={`https://www.google.com/s2/favicons?domain=${new URL(result.pages[0].url).hostname}&sz=32`}
              alt=""
              width={20}
              height={20}
              unoptimized
              className="rounded-sm shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-primary)" }}
          >
            {result.productBrief.company}
          </h1>
        </div>
        {result.pages[0]?.url && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {result.pages[0].url}
          </p>
        )}
      </div>

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
                pages={result.pages}
                competitors={result.competitors}
                recommendations={result.recommendations}
                sectionIndex={i}
                pageSections={result.pageSections}
              />
            </div>
          ))}



        </div>
      </div>
    </div>
  );
}
