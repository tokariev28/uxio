"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "./ScoreBadge";
import { ScreenshotViewer } from "./ScreenshotViewer";
import { CompetitorTabSwitcher, type TabItem } from "./CompetitorTabSwitcher";
import type {
  SectionAnalysis,
  SectionType,
  PageData,
  Competitor,
} from "@/lib/types/analysis";

const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  features: "Features",
  socialProof: "Social Proof",
  pricing: "Pricing",
  cta: "Call to Action",
  footer: "Footer",
};

export function getScreenshotUrl(
  site: string,
  pages: PageData[],
  competitors: Competitor[]
): string | undefined {
  if (site === "input") return pages[0]?.screenshotBase64;
  const idx = competitors.findIndex((c) => c.name === site);
  return idx === -1 ? undefined : pages[idx + 1]?.screenshotBase64;
}

interface SectionCardProps {
  section: SectionAnalysis;
  pages: PageData[];
  competitors: Competitor[];
  sectionIndex: number;
}

export function SectionCard({
  section,
  pages,
  competitors,
  sectionIndex,
}: SectionCardProps) {
  const [activeTab, setActiveTab] = useState("input");

  const inputFinding = section.findings.find((f) => f.site === "input");
  const activeFinding = section.findings.find((f) => f.site === activeTab);

  // Build tabs: "input" always first, then competitors in order
  const tabs: TabItem[] = [
    {
      id: "input",
      label: "Your site",
      score: inputFinding?.score ?? null,
    },
    ...competitors.map((c) => {
      const finding = section.findings.find((f) => f.site === c.name);
      return {
        id: c.name,
        label: c.name,
        score: finding?.score ?? null,
      };
    }),
  ];

  const screenshotSrc = getScreenshotUrl(activeTab, pages, competitors);
  const label = SECTION_LABELS[section.sectionType] ?? section.sectionType;

  return (
    <Card id={`section-${sectionIndex}`} className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle
            className="text-base"
            style={{ fontFamily: "var(--font-primary)" }}
          >
            {label}
          </CardTitle>
          {inputFinding && <ScoreBadge score={inputFinding.score} />}
        </div>
        <CompetitorTabSwitcher
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </CardHeader>

      {/* Screenshot — flush to card edge, no horizontal padding */}
      <ScreenshotViewer
        src={screenshotSrc}
        alt={`${label} screenshot — ${activeTab === "input" ? "Your site" : activeTab}`}
      />

      <CardContent className="pt-4">
        {activeFinding ? (
          <div className="flex flex-col gap-2">
            {activeFinding.evidence.visualNote && (
              <p className="text-sm italic text-muted-foreground">
                {activeFinding.evidence.visualNote}
              </p>
            )}
            {activeFinding.evidence.quote && (
              <blockquote className="border-l-2 border-accent pl-3 py-0.5">
                <p className="text-sm italic text-muted-foreground">
                  &ldquo;{activeFinding.evidence.quote}&rdquo;
                </p>
              </blockquote>
            )}
            <p className="text-sm text-foreground">{activeFinding.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No data available for this site.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
